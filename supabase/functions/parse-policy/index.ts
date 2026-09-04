/* ========================================================================
 * Edge Function: parse-policy
 * 功能：接收保单 OCR 文本，调用大模型解析，返回结构化保单字段 JSON
 * 调用方式：POST { text: string }
 * 返回：{ ok: boolean, data?: {...policyFields}, error?: string }
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

    if (!text || text.trim().length < 20) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'OCR 文本过短或为空，请确保图片清晰后重试',
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const systemPrompt = `你是一位专业的保单信息提取专家。用户会提供保单照片经 OCR 提取的文字内容，请你从中提取结构化的保单信息，以 JSON 格式返回。

要求：
1. 仔细分析 OCR 文本，提取所有可识别的保单字段
2. OCR 可能有识别错误，请根据上下文智能修正（如数字 O→0，l→1 等）
3. 无法识别的字段填空字符串 ""
4. 日期统一格式为 YYYY-MM-DD（如 2023-01-15），无法确定完整日期时尽力推断
5. 金额统一为纯数字字符串（如 "12000.00"），去掉千分位和"元"字
6. 返回纯 JSON，不要包含 markdown 标记

JSON 字段说明：
{
  "name": "投保人姓名",
  "idCard": "投保人身份证号",
  "phone": "投保人手机号",
  "address": "投保人地址",
  "policyCode": "保单号/保单代码",
  "insuranceName": "险种名称/产品名称",
  "codeType": "险种代码（如有）",
  "insuranceCompany": "保险公司名称",
  "annualPremium": "年保费（纯数字）",
  "sumInsured": "保额/基本保险金额（纯数字）",
  "startDate": "保单生效日期（YYYY-MM-DD）",
  "maturityDate": "满期日期（YYYY-MM-DD，如有）",
  "hasDividend": "是否有分红（true/false）",
  "status": "保单状态，从以下选择：active(有效)|lapsed(失效)|surrendered(已退保)|matured(已满期)|unknown(未知)",
  "paymentMethod": "缴费方式，从以下选择：annual(年缴)|monthly(月缴)|quarterly(季缴)|semiannual(半年缴)|single(趸交)|unknown(未知)",
  "paymentYears": "缴费年限（纯数字字符串，如 20）",
  "insuredName": "被保险人姓名",
  "insuredRelation": "被保险人与投保人关系（如 本人/配偶/子女/父母 等）",
  "insuredIdCard": "被保险人身份证号",
  "insuredPhone": "被保险人手机号",
  "beneficiary": "受益人信息",
  "survivalType": "生存金领取类型，从以下选择：annual(每年)|triennial(每三年)|maturity(满期一次性)|none(无)",
  "survivalAmount": "生存金领取金额（纯数字）",
  "survivalStartDate": "生存金起领日期（YYYY-MM-DD）",
  "note": "其他保单备注信息（不超过200字）"
}`;

    const userPrompt = `请从以下 OCR 文本中提取保单结构化信息：

---

${text}

---

请返回 JSON 格式的提取结果。只返回你能从文本中识别到的字段，无法识别的填空字符串。`;

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
      parsed = JSON.parse(result.content);
    } catch {
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
