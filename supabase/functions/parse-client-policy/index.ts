/* ========================================================================
 * Edge Function: parse-client-policy
 * 功能：接收多张截图经OCR提取的合并文本，调用大模型解析，
 *       一次返回客户信息 + 一个或多个保单信息
 * 调用方式：POST { text: string }
 * 返回：{ ok: boolean, data?: { client: {...}, policies: [...] }, error?: string }
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

    if (!text || text.trim().length < 10) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'OCR 文本过短或为空，请确保图片清晰后重试',
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const systemPrompt = `你是一位专业的保险信息提取专家。用户会提供多张保险公司APP截图（如投保人信息页、保单详情页、被保人信息页、受益人页等）经 OCR 提取的合并文本。请从中提取客户信息和所有保单信息，以 JSON 格式返回。

【重要说明】
- 文本可能来自多张截图，包含投保人页、保单详情页、被保人页、受益人页等
- 可能包含多个保单的信息，请逐个提取
- OCR 可能有识别错误，请根据上下文智能修正
- 投保人信息即客户信息；如果投保人和被保人是同一人，被保人信息与投保人相同

【提取规则】
1. 无法识别的字段填空字符串 ""，不要猜测
2. 日期统一格式 YYYY-MM-DD
3. 金额统一为纯数字字符串
4. 身份证号统一 18 位格式
5. 手机号统一 11 位纯数字
6. 返回纯 JSON

【字段映射参考】
"投保单号/保单号"→policyCode；"险种"→insuranceName（如"S43-康宁定期保险"，名称是"康宁定期保险"，代码是"S43"）；"生效日期"→effectiveDate；"保单状态"→status；"缴费方式"→paymentMethod(年→annual,月→monthly,趸交→single)；"缴费期"→paymentYears；"保费"→annualPremium；"保额"→sumInsured；"银行账号"→拆分paymentBank+paymentBankCard；"投保人"→policyholderName(即客户姓名)；"被保险人"→insuredName；"受益人"→beneficiaries数组

【返回JSON结构】
{
  "client": {
    "name": "客户姓名", "idCard": "身份证号", "phone": "手机号",
    "gender": "性别", "birthday": "出生日期", "address": "地址",
    "workCompany": "工作单位", "workAddress": "工作地址",
    "familyMembers": [{"name":"姓名","relationship":"关系","idCard":"身份证","phone":"手机","gender":"性别","birthday":"生日","note":"备注"}],
    "note": "备注"
  },
  "policies": [
    {
      "policyCode": "保单号", "insuranceName": "险种名称", "codeType": "险种代码",
      "insuranceCompany": "保险公司", "mainType": "主险|附加险",
      "annualPremium": "年保费", "sumInsured": "保额",
      "effectiveDate": "生效日期", "maturityDate": "满期日期",
      "hasDividend": true, "status": "active",
      "paymentMethod": "annual", "paymentYears": "缴费年限",
      "paymentBank": "银行", "paymentBankCard": "卡号后四位",
      "insuredName": "被保人", "insuredRelation": "关系",
      "insuredIdCard": "被保人身份证", "insuredPhone": "被保人电话", "insuredAddress": "被保人地址",
      "beneficiaries": [{"name":"姓名","relationship":"关系","quota":"比例","idCard":"身份证","birthday":"生日","gender":"性别"}],
      "survivalType": "annual|triennial|maturity|none", "survivalAmount": "金额", "survivalStartDate": "起领日期",
      "note": "备注"
    }
  ]
}

注意：client 是投保人信息，policies 是保单数组（可能多个）；被保人就是投保人时 insuredRelation 填"本人"；familyMembers 不放投保人自己。`;

    const userPrompt = `请从以下 OCR 文本中提取客户信息和所有保单信息。文本可能来自多张 APP 截图的合并，请综合提取所有信息，并按保单逐个拆分。\n\n---\n${text}\n---\n请返回 JSON 格式。`;

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
