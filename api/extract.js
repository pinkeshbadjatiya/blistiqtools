// api/extract.js
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Now expecting an array of base64 strings instead of plain text
    const { pdfFilesBase64 } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) return res.status(500).json({ error: 'API key not configured.' });
    if (!pdfFilesBase64 || pdfFilesBase64.length === 0) return res.status(400).json({ error: 'No PDFs provided.' });

    const promptText = `Extract the following details from the attached PDF documents for each order/customer found: Full Name, Phone No, Address, Order Source. 
    Return the data STRICTLY as a JSON array of objects with the keys: "FullName", "PhoneNo", "Address", "OrderSource". 
    If a detail is missing, leave the value as an empty string.`;

    // Build the parts array: First part is the prompt, followed by all the PDF files
    const parts = [{ text: promptText }];
    
    pdfFilesBase64.forEach(base64Data => {
        parts.push({
            inlineData: {
                mimeType: "application/pdf",
                data: base64Data
            }
        });
    });

    try {
        // Note: Change 'gemini-3-flash' to whichever model version is active on your API key
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: parts }],
                generationConfig: { response_mime_type: "application/json" }
            })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Gemini API Error');

        const extractedDetails = JSON.parse(data.candidates[0].content.parts[0].text);
        return res.status(200).json(extractedDetails);

    } catch (error) {
        console.error("Extraction error:", error);
        return res.status(500).json({ error: error.message || 'Failed to process PDFs' });
    }
}
