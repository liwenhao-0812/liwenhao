/* ========================================================================
 * Edge Function: parse-client (单文件版，适合控制台在线部署)
 * 功能：接收客户资料 OCR 文本，调用大模型解析，返回结构化客户字段 JSON
 * 调用方式：POST { text: string }
 * 返回：{ ok: boolean, data?: {...clientFields}, error?: string }
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
    if (!text || text.trim().length < 10) {
      return new Response(JSON.stringify({ ok: false, error: 'OCR 文本过短或为空' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const systemPrompt = `你是一位专业的客户信息提取专家。用户会提供客户资料照片（如身份证、被保人信息页、客户信息表、投保单、名片等）经OCR提取的文字内容，请从中提取结构化的客户信息，以JSON格式返回。
【重要说明】- 图片可能是保险公司APP的被保人信息页，字段名如"姓名、性别、电话、证件号码、出生日期、地址"等 - 可能是多张截图合并的文本，请综合所有信息 - OCR可能有识别错误，请根据上下文智能修正（如数字O→0，l→1，身份证号末位X保留大写等）
【提取规则】1. 无法识别的字段填空字符串""，不要猜测 2. 身份证号统一18位格式，有OCR错误时尝试修正 3. 手机号统一11位纯数字 4. 性别填"男"或"女" 5. 返回纯JSON
【字段映射参考】"姓名"→name；"性别"→gender；"电话/手机号"→phone；"证件号码/身份证"→idCard；"出生日期/生日"→birthday；"地址/住址"→address；"工作单位/公司"→workCompany；"工作地址"→workAddress；"客户号"→放入note
【JSON字段】{"name":"客户姓名","idCard":"身份证号(18位)","phone":"手机号(11位)","gender":"男/女","birthday":"出生日期(YYYY-MM-DD)","address":"联系地址","workCompany":"工作单位","workAddress":"工作地址","familyMembers":[{"name":"家庭成员姓名","relationship":"关系(如配偶/儿子/女儿/父亲/母亲)","idCard":"家庭成员身份证号","phone":"家庭成员手机号","gender":"性别","birthday":"出生日期","note":"备注"}],"note":"其他重要信息(不超过200字)"}
注意：familyMembers是数组，如能识别到家庭成员信息请逐个提取；不要把投保人/被保人自己的信息放入familyMembers；如果照片只是单个被保人信息页，familyMembers为空数组。`;
    const userPrompt = `请从以下OCR文本中提取客户结构化信息：\n---\n${text}\n---\n请返回JSON格式的提取结果。无法识别的填空字符串。`;
    const result = await callLLM([{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }]);
    if (!result.ok) return new Response(JSON.stringify({ ok: false, error: result.error }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    let parsed;
    try { parsed = JSON.parse(result.content); } catch { const m = result.content.match(/\{[\s\S]*\}/); if (m) { try { parsed = JSON.parse(m[0]); } catch { return new Response(JSON.stringify({ ok: false, error: 'JSON解析失败', raw: result.content.substring(0, 500) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } } else { return new Response(JSON.stringify({ ok: false, error: 'JSON解析失败', raw: result.content.substring(0, 500) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } }
    return new Response(JSON.stringify({ ok: true, data: parsed, provider: result.provider }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: `服务器异常: ${(e as Error).message}` }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
