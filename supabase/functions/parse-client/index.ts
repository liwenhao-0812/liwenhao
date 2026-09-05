/* ========================================================================
 * Edge Function: parse-client
 * 功能：接收客户资料 OCR 文本，调用大模型解析，返回结构化客户字段 JSON
 * 调用方式：POST { text: string }
 * 返回：{ ok: boolean, data?: {...clientFields}, error?: string }
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

    const systemPrompt = `你是一位专业的客户信息提取专家。用户会提供客户资料照片（如身份证、客户信息表、投保单、名片等）经 OCR 提取的文字内容，请从中提取结构化的客户信息，以 JSON 格式返回。

要求：
1. 仔细分析 OCR 文本，提取所有可识别的客户字段
2. OCR 可能有识别错误，请根据上下文智能修正（如数字 O→0，l→1，身份证号 X→X 等）
3. 无法识别的字段填空字符串 ""，不要猜测
4. 身份证号统一为18位格式，如有OCR识别错误的可尝试修正
5. 手机号统一为11位数字
6. 返回纯 JSON，不要包含 markdown 标记

JSON 字段说明：
{
  "name": "客户/投保人姓名",
  "idCard": "身份证号（18位）",
  "phone": "手机号（11位数字）",
  "address": "联系地址/住址",
  "workCompany": "工作单位/公司名称",
  "workAddress": "工作地址",
  "familyMembers": [
    {
      "name": "家庭成员姓名",
      "relationship": "与投保人关系（如：配偶/丈夫/妻子/儿子/女儿/父亲/母亲等）",
      "idCard": "家庭成员身份证号",
      "phone": "家庭成员手机号",
      "note": "备注信息（如年龄、职业等）"
    }
  ],
  "note": "其他重要信息备注（不超过200字）"
}

注意：
- familyMembers 是数组，如果照片中能识别到家庭成员信息（如投保单上的家庭成员表），请逐个提取
- 如果照片只是身份证，通常只有 name 和 idCard 两个字段
- 如果照片是客户信息登记表，可能有更多字段
- 不要把投保人自己的信息放入 familyMembers`;

    const userPrompt = `请从以下 OCR 文本中提取客户结构化信息：

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
