export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' })
  }

  const { prompt, maxOutputTokens = 8192, temperature = 0.1, jsonMode = true } = req.body || {}

  if (!prompt) {
    return res.status(400).json({ error: 'prompt is required' })
  }

  const model = 'gemini-2.0-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const config = { temperature, maxOutputTokens }
  if (jsonMode) config.responseMimeType = 'application/json'

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: config
      })
    })

    const data = await response.json()
    return res.status(response.status).json(data)
  } catch (err) {
    console.error('Gemini proxy error:', err)
    return res.status(502).json({ error: 'Failed to reach Gemini API' })
  }
}
