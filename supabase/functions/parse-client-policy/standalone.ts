/* ========================================================================
 * Edge Function: parse-client-policy (单文件版，适合控制台在线部署)
 * 功能：接收多张保单/客户截图经OCR提取的合并文本，调用大模型解析，
 *       一次返回客户信息 + 一个或多个保单信息
 * 调用方式：POST { text: string }
 * 返回：{ ok: boolean, data?: { client: {...}, policies: [...] }, error?: string }
 * ======================================================================== */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface LLMMessage { role: 'system' | 'user' | 'assistant'; content: string; }
interface LLMResult { ok: boolean; content: string; error?: string; provider?: string; }

async function callDeepSeek(messages: LLMMessage[], apiKey: string): Promise<LLMResult> {
  try {
    const resp = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'deepseek-chat', messages, temperature: 0.1, max_tokens: 8192, response_format: { type: 'json_object' } }),
    });
    if (!resp.ok) { const e = await resp.text(); return { ok: false, content: '', error: `DeepSeek HTTP ${resp.status}: ${e.substring(0, 200)}` }; }
    const data = await resp.json();
    return { ok: true, content: data?.choices?.[0]?.message?.content || '', provider: 'deepseek' };
  } catch (e) { return { ok: false, content: '', error: `DeepSeek 异常: ${(e as Error).message}` }; }
}

async function callQwen(messages: LLMMessage[], apiKey: string): Promise<LLMResult> {
  try {
    const resp = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'qwen-plus', messages, temperature: 0.1, max_tokens: 8192, response_format: { type: 'json_object' } }),
    });
    if (!resp.ok) { const e = await resp.text(); return { ok: false, content: '', error: `Qwen HTTP ${resp.status}: ${e.substring(0, 200)}` }; }
    const data = await resp.json();
    return { ok: true, content: data?.choices?.[0]?.message?.content || '', provider: 'qwen' };
  } catch (e) { return { ok: false, content: '', error: `Qwen 异常: ${(e as Error).message}` }; }
}

async function callLLM(messages: LLMMessage[]): Promise<LLMResult> {
  const dk = Deno.env.get('DEEPSEEK_API_KEY');
  const qk = Deno.env.get('QWEN_API_KEY');
  if (dk) { const r = await callDeepSeek(messages, dk); if (r.ok) return r; console.warn(`DeepSeek fail, try Qwen: ${r.error}`); }
  if (qk) { const r = await callQwen(messages, qk); if (r.ok) return r; console.warn(`Qwen fail: ${r.error}`); }
  return { ok: false, content: '', error: '所有供应商均不可用，请检查 API Key 配置' };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json();
    const text = body?.text;
    if (!text || text.trim().length < 10) {
      return new Response(JSON.stringify({ ok: false, error: 'OCR 文本过短或为空' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const systemPrompt = `你是一位专业的保险信息提取专家。用户会提供多张保险公司APP截图（如投保人信息页、保单详情页、被保人信息页、受益人页等）经OCR提取的合并文本。请从中提取客户信息和所有保单信息，以JSON格式返回。

【重要说明】
- 文本可能来自多张截图，包含投保人页、保单详情页、被保人页、受益人页等
- 可能包含多个保单的信息，请逐个提取
- OCR可能有识别错误，请根据上下文智能修正（如数字O→0，l→1，身份证号末位X保留大写等）
- 投保人信息即客户信息；如果投保人和被保人是同一人，被保人信息与投保人相同

【提取规则】
1. 无法识别的字段填空字符串""，不要猜测
2. 日期统一格式 YYYY-MM-DD
3. 金额统一为纯数字字符串（去掉千分位和"元"字）
4. 身份证号统一18位格式
5. 手机号统一11位纯数字
6. 返回纯JSON，不要包含markdown标记

【字段映射参考（APP截图常见格式）】
"投保单号/保单号"→policyCode；"险种"→insuranceName（注意如"S43-康宁定期保险"，名称是"康宁定期保险"，代码是"S43"）；"险种代码/前缀"→codeType；"生效日期"→effectiveDate；"保单状态"→status(维持有效→active,失效→lapsed,已退保→surrendered,已满期→matured)；"缴费方式"→paymentMethod(年→annual,月→monthly,季→quarterly,半年→semiannual,趸交→single)；"缴费期/缴费年期"→paymentYears(纯数字)；"保费/年交保费"→annualPremium；"保额"→sumInsured；"银行账号"→拆分paymentBank(银行名)和paymentBankCard(卡号后四位)；"投保人"→policyholderName(即客户姓名)；"被保险人"→insuredName；"被保险人证件号"→insuredIdCard；"被保险人电话"→insuredPhone；"被保险人地址"→insuredAddress；"与投保人关系"→insuredRelation(同一人填"本人")；"受益人"→beneficiaries数组；"主附险标志"→mainType(主险/附加险)

【返回JSON结构】
{
  "client": {
    "name": "客户姓名（即投保人姓名）",
    "idCard": "身份证号（18位）",
    "phone": "手机号（11位）",
    "gender": "性别（男/女）",
    "birthday": "出生日期（YYYY-MM-DD）",
    "address": "联系地址",
    "workCompany": "工作单位",
    "workAddress": "工作地址",
    "familyMembers": [
      {
        "name": "家庭成员姓名",
        "relationship": "关系（如：配偶/儿子/女儿/父亲/母亲/受益人等）",
        "idCard": "家庭成员身份证号",
        "phone": "家庭成员手机号",
        "gender": "性别",
        "birthday": "出生日期",
        "note": "备注"
      }
    ],
    "note": "其他客户备注信息（不超过200字）"
  },
  "policies": [
    {
      "policyCode": "保单号",
      "insuranceName": "险种名称（去掉代码前缀）",
      "codeType": "险种代码（如 S43）",
      "insuranceCompany": "保险公司名称",
      "mainType": "主险|附加险|万能险",
      "annualPremium": "年保费（纯数字）",
      "sumInsured": "保额（纯数字）",
      "effectiveDate": "生效日期（YYYY-MM-DD）",
      "maturityDate": "满期日期",
      "hasDividend": true,
      "status": "active|lapsed|surrendered|matured|unknown",
      "paymentMethod": "annual|monthly|quarterly|semiannual|single|unknown",
      "paymentYears": "缴费年限（纯数字）",
      "paymentBank": "缴费银行名称",
      "paymentBankCard": "银行卡后四位",
      "insuredName": "被保险人姓名",
      "insuredRelation": "与投保人关系",
      "insuredIdCard": "被保险人身份证号",
      "insuredPhone": "被保险人手机号",
      "insuredAddress": "被保险人地址",
      "beneficiaries": [
        {
          "name": "受益人姓名",
          "relationship": "与被保险人关系",
          "quota": "受益比例（如100%）",
          "idCard": "受益人身份证号",
          "birthday": "出生日期",
          "gender": "性别"
        }
      ],
      "survivalType": "annual|triennial|maturity|none",
      "survivalAmount": "生存金金额",
      "survivalStartDate": "起领日期",
      "note": "保单备注（不超过300字）"
    }
  ]
}

注意：
- client 是投保人信息，policies 是保单数组，可能有一个或多个保单
- 如果被保人就是投保人本人，insuredRelation 填"本人"，insuredName/idCard/phone 等与 client 相同
- familyMembers 不要放投保人自己的信息
- 如果识别到受益人信息同时也在家庭成员中，两边都保留
- 请仔细区分不同保单的信息，不要混淆`;

    const userPrompt = `请从以下OCR文本中提取客户信息和所有保单信息。文本可能来自多张APP截图的合并，请综合提取所有信息，并按保单逐个拆分。\n---\n${text}\n---\n请返回JSON格式。`;
    const result = await callLLM([{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }]);
    if (!result.ok) return new Response(JSON.stringify({ ok: false, error: result.error }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    let parsed;
    try { parsed = JSON.parse(result.content); } catch { const m = result.content.match(/\{[\s\S]*\}/); if (m) { try { parsed = JSON.parse(m[0]); } catch { return new Response(JSON.stringify({ ok: false, error: 'JSON解析失败', raw: result.content.substring(0, 500) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } } else { return new Response(JSON.stringify({ ok: false, error: 'JSON解析失败', raw: result.content.substring(0, 500) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } }
    return new Response(JSON.stringify({ ok: true, data: parsed, provider: result.provider }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: `服务器异常: ${(e as Error).message}` }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
