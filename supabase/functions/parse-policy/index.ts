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

    const systemPrompt = `你是一位专业的保单信息提取专家。用户会提供保单APP截图或保单照片经 OCR 提取的文字内容，请你从中提取结构化的保单信息，以 JSON 格式返回。

【重要说明】
- 图片可能是保险公司APP的截图（如中国人寿、平安等），字段名和格式与纸质保单不同
- 可能是多张截图合并的文本，包含投保人页、保单详情页、被保人页、受益人页等
- 请综合所有信息，提取最完整的保单数据
- OCR 可能有识别错误，请根据上下文智能修正（如数字 O→0，l→1 等）

【提取规则】
1. 无法识别的字段填空字符串 ""，不要猜测
2. 日期统一格式为 YYYY-MM-DD（如 2023-01-15）
3. 金额统一为纯数字字符串（如 "12000.00"），去掉千分位和"元"字
4. 返回纯 JSON，不要包含 markdown 标记

【字段映射参考（APP截图常见格式）】
- "投保单号"、"保单号" → policyCode
- "险种"、"险种名称" → insuranceName（注意：如"S43-康宁定期保险"，名称是"康宁定期保险"，代码是"S43"）
- "险种代码"、险种前缀（如S43-中的S43）→ codeType
- "生效日期" → effectiveDate
- "保单状态" → status（如"维持有效"→active，"失效"→lapsed，"已退保"→surrendered，"已满期"→matured）
- "缴费方式" → paymentMethod（"年"→annual，"月"→monthly，"季"→quarterly，"半年"→semiannual，"趸交"→single）
- "缴费期"、"缴费年期" → paymentYears（纯数字）
- "保险期间" → 注意单位，如果是数字如"36"且险种是定期险，可能是年；填入maturityDate计算或留空，把原始值放到note里
- "保费"、"年交保费"、"年保费" → annualPremium（纯数字）
- "保额"、"基本保险金额" → sumInsured（纯数字）
- "银行账号"、"缴费银行" → paymentBank + paymentBankCard（如"中国农业银行-44684400460031243"，银行名填paymentBank，后四位填paymentBankCard）
- "投保人"、"投保人姓名" → policyholderName
- "被保险人"、"被保人" → insuredName
- "被保险人证件号"、"被保人身份证" → insuredIdCard
- "被保险人电话" → insuredPhone
- "被保险人地址" → insuredAddress
- "与投保人关系" → insuredRelation（如果投保人和被保人是同一个人，填"本人"）
- "受益人"、"受益人姓名" → beneficiaries数组
- "主附险标志" → mainType（"主险"→主险，"附加险"→附加险）

【JSON 字段说明】
{
  "policyCode": "保单号/投保单号",
  "insuranceName": "险种名称（只取名称部分，去掉代码前缀）",
  "codeType": "险种代码（如 S43）",
  "insuranceCompany": "保险公司名称（能识别到才填）",
  "mainType": "主险/附加险/万能险，从以下选择：主险|附加险|万能险",
  "annualPremium": "年保费（纯数字字符串）",
  "sumInsured": "保额/基本保险金额（纯数字字符串）",
  "effectiveDate": "生效日期（YYYY-MM-DD）",
  "maturityDate": "满期日期（YYYY-MM-DD，如有）",
  "hasDividend": "是否有分红（true/false）",
  "status": "保单状态，从以下选择：active|lapsed|surrendered|matured|unknown",
  "paymentMethod": "缴费方式，从以下选择：annual|monthly|quarterly|semiannual|single|unknown",
  "paymentYears": "缴费年限（纯数字字符串，如 20）",
  "paymentBank": "缴费银行名称（如 中国农业银行）",
  "paymentBankCard": "银行卡后四位（纯数字字符串）",
  "policyholderName": "投保人姓名",
  "policyholderIdCard": "投保人身份证号（能识别到才填）",
  "policyholderPhone": "投保人手机号（能识别到才填）",
  "insuredName": "被保险人姓名",
  "insuredRelation": "被保险人与投保人关系（本人/配偶/子女/父母等）",
  "insuredIdCard": "被保险人身份证号",
  "insuredPhone": "被保险人手机号",
  "insuredAddress": "被保险人地址",
  "beneficiaries": [
    {
      "name": "受益人姓名",
      "relationship": "与被保险人关系（如：子女/配偶/父母等，能识别到才填）",
      "quota": "受益比例（如：100%，能识别到才填）",
      "idCard": "受益人身份证号（能识别到才填）",
      "birthday": "受益人出生日期（YYYY-MM-DD，能识别到才填）",
      "gender": "受益人性别（男/女，能识别到才填）"
    }
  ],
  "survivalType": "生存金领取类型，从以下选择：annual|triennial|maturity|none",
  "survivalAmount": "生存金领取金额（纯数字）",
  "survivalStartDate": "生存金起领日期（YYYY-MM-DD）",
  "note": "其他保单备注信息（如保险期间原始值、客户号等，不超过300字）"
}`;

    const userPrompt = `请从以下 OCR 文本中提取保单结构化信息。注意：文本可能来自多张APP截图的合并，请综合提取所有信息。

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
