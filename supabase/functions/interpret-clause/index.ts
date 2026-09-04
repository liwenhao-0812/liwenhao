/* ========================================================================
 * Edge Function: interpret-clause
 * 功能：接收险种条款文本，调用大模型解读，返回结构化特征 JSON
 * 调用方式：POST { text: string, insuranceName?: string }
 * 返回：{ ok: boolean, data?: {...traits}, error?: string }
 * ======================================================================== */
import { corsHeaders, callLLM, type LLMMessage } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  /* CORS 预检 */
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const text = body?.text;
    const insuranceName = body?.insuranceName || '';

    if (!text || text.trim().length < 50) {
      return new Response(JSON.stringify({
        ok: false,
        error: '条款文本过短或为空，请上传完整条款内容',
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    /* 截取前 15000 字符（约 8000 tokens），避免超出上下文窗口 */
    const truncatedText = text.substring(0, 15000);

    const systemPrompt = `你是一位专业的保险条款解读专家。请根据用户提供的保险条款文本，提取以下结构化信息，并以严格的JSON格式返回。

【重要规则】
1. 每个字段只能从下面给出的"可选值"中选择，不要自己编造值
2. 无法确定的字段填空字符串""，不要猜测
3. 注意区分"生存金/年金"和"分红金"：生存金是合同约定的固定给付（如每3年返保额的5%），分红金是保险公司根据经营状况分配的红利（不确定金额）
4. 返回纯JSON，不要包含markdown标记、代码块或多余文字

【字段定义与可选值】

1. category - 险种类别
   可选值：重疾险 | 防癌险 | 医疗险 | 寿险 | 年金险 | 万能险 | 意外险 | 两全险 | 分红险 | 教育金 | 其他
   判断依据：以主要保障责任为准。分红型年金险优先选"年金险"，分红型两全险优先选"两全险"。

2. waitingPeriod - 等待期天数
   可选值："0"（无等待期）| "30" | "60" | "90" | "180" | 自定义数字字符串
   注意：明确写"无等待期"、"等待期为0"或无相关描述填"0"；医疗/重疾险常见90或180天；意外险通常无等待期。

3. annuityStart - 生存金/年金领取起始方式
   可选值："none"（无领取责任）| "afterYears"（投保后N年起领）| "atAge"（到达某年龄起领）| "fixedDate"（固定日期/期限起领）
   注意：条款中有"生存保险金"、"年金"、"领取"等描述，且明确了领取时间的填对应值；明确无生存金领取责任的填"none"。

4. annuityStartVal - 生存金领取起始值
   annuityStart=afterYears 时填投保年数（如 "3" 表示第3年起领）
   annuityStart=atAge 时填年龄（如 "60" 表示60岁起领）
   annuityStart=fixedDate 时填日期描述（如 "2035年1月"）
   annuityStart=none 时填""

5. annuityFreq - 生存金领取频率
   可选值："annual"（每年领取）| "semiannual"（每半年领取）| "quarterly"（每季度领取）| "monthly"（每月领取）| "triennial"（每3年领取）| "lumpsum"（到期一次性领取）| "none"（无）
   注意：annuityStart=none 时此值为"none"。

6. annuityAmount - 生存金领取金额/比例
   纯数字字符串，如"5"表示保额的5%，"1000"表示1000元。无法确定填""。

7. dividendStart - 分红金领取起始方式
   可选值："none"（无分红）| "nextYear"（次年起·保单年满日领）| "afterYears"（投保后N年起领）| "fixedDate"（固定日期起领）
   注意：条款中有"红利"、"分红"、"保单红利"等描述的才填此项；大多数分红险是"次年起·保单年满日领"即nextYear。

8. dividendStartVal - 分红金起始值
   dividendStart=afterYears 时填年数，其他情况填""

9. dividendFreq - 分红金领取频率
   可选值："annual"（每年领取）| "semiannual"（每半年领取）| "quarterly"（每季度领取）| "monthly"（每月领取）| "triennial"（每3年领取）| "lumpsum"（到期一次性领取）| "none"（无）
   注意：大多数分红险是每年领取即annual。dividendStart=none时此值为"none"。

10. note - 其他重要条款备注
    简洁概括，不超过200字。只放上面字段无法覆盖的重要信息。`;

    const userPrompt = `请解读以下保险条款文本${insuranceName ? `（险种名称：${insuranceName}）` : ''}，提取结构化特征信息：

---

${truncatedText}

---

请返回 JSON 格式的解读结果。`;

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const result = await callLLM(messages);

    if (!result.ok) {
      return new Response(JSON.stringify({
        ok: false,
        error: result.error || '大模型调用失败',
      }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    /* 解析返回的 JSON */
    let parsed;
    try {
      /* 尝试直接解析 */
      parsed = JSON.parse(result.content);
    } catch {
      /* 尝试提取 JSON 块 */
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch {
          return new Response(JSON.stringify({
            ok: false,
            error: '模型返回内容无法解析为 JSON',
            raw: result.content.substring(0, 500),
          }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      } else {
        return new Response(JSON.stringify({
          ok: false,
          error: '模型返回内容无法解析为 JSON',
          raw: result.content.substring(0, 500),
        }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      data: parsed,
      provider: result.provider,
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e) {
    return new Response(JSON.stringify({
      ok: false,
      error: `服务器异常: ${(e as Error).message}`,
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
