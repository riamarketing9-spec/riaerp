// Drafts a client-facing report from real data (published content + completed
// tasks in the period) using Llama 3.3 70B via Groq (Kimi K2 was requested
// but isn't available on this Groq account's model list). Called on-demand
// (once per project per reporting period), never on page load — that's what
// keeps this economical. The model only turns already-fetched facts into
// readable text; it does not decide what counts as "done".
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')

    const { project_id, period_start, period_end, language } = await req.json()
    if (!project_id || !period_start || !period_end) {
      throw new Error('project_id, period_start, period_end are required')
    }
    const lang = language === 'uz' ? 'uz' : 'ru'

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: project, error: projErr } = await callerClient
      .from('projects')
      .select('name, goal')
      .eq('id', project_id)
      .single()
    if (projErr) throw projErr

    const { data: content } = await callerClient
      .from('content_plan_items')
      .select('topic, publish_date')
      .eq('project_id', project_id)
      .gte('publish_date', period_start)
      .lte('publish_date', period_end)

    const { data: tasks } = await callerClient
      .from('tasks')
      .select('title, deliverable_text')
      .eq('project_id', project_id)
      .gte('completed_at', period_start)
      .lte('completed_at', period_end)

    const groqKey = Deno.env.get('GROQ_API_KEY')!

    const contentLines = (content ?? []).map((c) => `- ${c.topic} (${c.publish_date})`).join('\n')
    const taskLines = (tasks ?? [])
      .map((t) => `- ${t.title}${t.deliverable_text ? ': ' + t.deliverable_text : ''}`)
      .join('\n')

    const prompt =
      lang === 'uz'
        ? `Sen — RIA marketing agentligining yordamchisisiz. "${project.name}" loyihasi bo'yicha ${period_start} dan ${period_end} gacha bo'lgan davr uchun mijozga qisqa, do'stona hisobot yoz. Hisobot O'ZBEK TILIDA bo'lishi SHART.

Chop etilgan kontent:
${contentLines || "ma'lumot yo'q"}

Bajarilgan vazifalar:
${taskLines || "ma'lumot yo'q"}

Izchil hisobot yoz (3-6 gap), markdown belgilarisiz, ishbilarmonlik ohangida, lekin iliq.`
        : `Ты — ассистент маркетингового агентства RIA. Составь короткий, дружелюбный отчёт клиенту на русском языке по проекту "${project.name}" за период с ${period_start} по ${period_end}.

Опубликованный контент:
${contentLines || 'нет данных'}

Выполненные задачи:
${taskLines || 'нет данных'}

Напиши связный отчёт (3-6 предложений), без markdown-разметки, в деловом, но тёплом тоне.`

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
      }),
    })

    if (!groqRes.ok) {
      const errText = await groqRes.text()
      throw new Error(`Groq API error: ${errText}`)
    }

    const groqData = await groqRes.json()
    const reportText = groqData.choices?.[0]?.message?.content ?? ''

    return new Response(JSON.stringify({ report: reportText }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
