// api/extract.js
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { text } = req.body;
    
    // This variable is securely hidden in Vercel's servers
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'API key is not configured on the server.' });
    }

    const prompt = `Extract the following details from the text below for each order/customer found: Full Name, Phone No, Address, Order Source. 
    Return the data STRICTLY as a JSON array of objects with the keys: "FullName", "PhoneNo", "Address", "OrderSource". 
    If a detail is missing, leave the value as an empty string. 
    Text to analyze:
    ${text}`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { response_mime_type: "application/json" }
            })
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error?.message || 'Gemini API Error');
        }

        const extractedDetails = JSON.parse(data.candidates[0].content.parts[0].text);
        return res.status(200).json(extractedDetails);

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: error.message || 'Failed to process text' });
    }
}
