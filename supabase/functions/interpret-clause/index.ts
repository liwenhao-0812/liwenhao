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

    const systemPrompt = `你是一位专业的保险条款解读专家。请根据用户提供的保险条款文本，提取以下结构化信息，并以 JSON 格式返回。

要求：
1. 仔细阅读条款全文，准确提取关键信息
2. 无法确定的字段填空字符串 ""，不要猜测
3. 返回纯 JSON，不要包含 markdown 标记或多余文字

JSON 字段说明：
{
  "category": "险种类别，从以下选项中选择：重疾险|医疗险|意外险|寿险|年金险|两全险|分红险|万能险|教育金|防癌险|其他",
  "waitingPeriod": "等待期天数（纯数字，如 90 或 180；无等待期填 0；未提及填空字符串）",
  "annuityStart": "生存金/年金领取起始方式，从以下选项选择：none(无领取责任)|afterYears(投保后N年起领)|atAge(到达某年龄起领)|fixedDate(固定日期起领)",
  "annuityStartVal": "领取起始值（如 afterYears 对应 '5年'，atAge 对应 '60岁'；none 或空则填空字符串）",
  "annuityFreq": "领取频率，从以下选项选择：annual(每年)|triennial(每三年)|monthly(每月)|lumpsum(一次性)|none(无)",
  "dividendStart": "分红金领取起始方式，从以下选项选择：none(无分红)|nextYear(次年起领)|afterYears(投保后N年起领)|fixedDate(固定日期起领)",
  "dividendStartVal": "分红起始值（格式同 annuityStartVal）",
  "dividendFreq": "分红领取频率（格式同 annuityFreq）",
  "note": "其他重要条款备注（如特殊赔付规则、豁免条款等，简洁概括，不超过200字）"
}`;

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
