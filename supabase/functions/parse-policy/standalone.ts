/* ========================================================================
 * Edge Function: parse-policy (单文件版，适合控制台在线部署)
 * 功能：接收保单 OCR 文本，调用大模型解析，返回结构化保单字段 JSON
 * 调用方式：POST { text: string }
 * 返回：{ ok: boolean, data?: {...policyFields}, error?: string }
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
      body: JSON.stringify({ model: 'deepseek-chat', messages, temperature: 0.1, max_tokens: 4096, response_format: { type: 'json_object' } }),
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
      body: JSON.stringify({ model: 'qwen-plus', messages, temperature: 0.1, max_tokens: 4096, response_format: { type: 'json_object' } }),
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
    if (!text || text.trim().length < 20) {
      return new Response(JSON.stringify({ ok: false, error: 'OCR 文本过短或为空' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const systemPrompt = `你是一位专业的保单信息提取专家。用户会提供保单照片经OCR提取的文字内容，请从中提取结构化的保单信息，以JSON格式返回。
要求：1.仔细分析OCR文本，提取所有可识别的保单字段 2.OCR可能有识别错误，请根据上下文智能修正 3.无法识别的字段填空字符串"" 4.日期统一格式YYYY-MM-DD 5.金额统一为纯数字字符串 6.返回纯JSON
JSON字段：{"name":"投保人姓名","idCard":"投保人身份证号","phone":"投保人手机号","address":"投保人地址","policyCode":"保单号","insuranceName":"险种名称","codeType":"险种代码","insuranceCompany":"保险公司","annualPremium":"年保费(纯数字)","sumInsured":"保额(纯数字)","startDate":"生效日期(YYYY-MM-DD)","maturityDate":"满期日期","hasDividend":"是否有分红(true/false)","status":"active|lapsed|surrendered|matured|unknown","paymentMethod":"annual|monthly|quarterly|semiannual|single|unknown","paymentYears":"缴费年限(纯数字)","insuredName":"被保险人姓名","insuredRelation":"与投保人关系","insuredIdCard":"被保人身份证号","insuredPhone":"被保人手机号","beneficiary":"受益人","survivalType":"annual|triennial|maturity|none","survivalAmount":"生存金金额(纯数字)","survivalStartDate":"起领日期(YYYY-MM-DD)","note":"其他备注(不超过200字)"}`;
    const userPrompt = `请从以下OCR文本中提取保单结构化信息：\n---\n${text}\n---\n请返回JSON格式的提取结果。无法识别的填空字符串。`;
    const result = await callLLM([{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }]);
    if (!result.ok) return new Response(JSON.stringify({ ok: false, error: result.error }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    let parsed;
    try { parsed = JSON.parse(result.content); } catch { const m = result.content.match(/\{[\s\S]*\}/); if (m) { try { parsed = JSON.parse(m[0]); } catch { return new Response(JSON.stringify({ ok: false, error: 'JSON解析失败', raw: result.content.substring(0, 500) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } } else { return new Response(JSON.stringify({ ok: false, error: 'JSON解析失败', raw: result.content.substring(0, 500) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } }
    return new Response(JSON.stringify({ ok: true, data: parsed, provider: result.provider }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: `服务器异常: ${(e as Error).message}` }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
