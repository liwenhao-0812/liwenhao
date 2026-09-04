/* ========================================================================
 * Edge Function: interpret-clause (单文件版，适合控制台在线部署)
 * 功能：接收险种条款文本，调用大模型解读，返回结构化特征 JSON
 * 调用方式：POST { text: string, insuranceName?: string }
 * 返回：{ ok: boolean, data?: {...traits}, error?: string }
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
    const insuranceName = body?.insuranceName || '';
    if (!text || text.trim().length < 50) {
      return new Response(JSON.stringify({ ok: false, error: '条款文本过短或为空' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const truncated = text.substring(0, 15000);
    const systemPrompt = `你是一位专业的保险条款解读专家。请根据用户提供的保险条款文本，提取以下结构化信息，并以 JSON 格式返回。
要求：1.仔细阅读条款全文，准确提取关键信息 2.无法确定的字段填空字符串"" 3.返回纯JSON
JSON字段：{"category":"重疾险|医疗险|意外险|寿险|年金险|两全险|分红险|万能险|教育金|防癌险|其他","waitingPeriod":"等待期天数(纯数字,无等待期填0)","annuityStart":"none|afterYears|atAge|fixedDate","annuityStartVal":"领取起始值","annuityFreq":"annual|triennial|monthly|lumpsum|none","dividendStart":"none|nextYear|afterYears|fixedDate","dividendStartVal":"分红起始值","dividendFreq":"annual|triennial|monthly|lumpsum|none","note":"其他重要备注(不超过200字)"}`;
    const userPrompt = `请解读以下保险条款文本${insuranceName ? `（险种名称：${insuranceName}）` : ''}：\n---\n${truncated}\n---\n请返回JSON格式的解读结果。`;
    const result = await callLLM([{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }]);
    if (!result.ok) return new Response(JSON.stringify({ ok: false, error: result.error }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    let parsed;
    try { parsed = JSON.parse(result.content); } catch { const m = result.content.match(/\{[\s\S]*\}/); if (m) { try { parsed = JSON.parse(m[0]); } catch { return new Response(JSON.stringify({ ok: false, error: 'JSON解析失败', raw: result.content.substring(0, 500) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } } else { return new Response(JSON.stringify({ ok: false, error: 'JSON解析失败', raw: result.content.substring(0, 500) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); } }
    return new Response(JSON.stringify({ ok: true, data: parsed, provider: result.provider }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: `服务器异常: ${(e as Error).message}` }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
