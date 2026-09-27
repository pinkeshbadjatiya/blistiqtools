// api/extract.js
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { pdfFilesBase64 } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) return res.status(500).json({ error: 'API key not configured.' });
    if (!pdfFilesBase64 || pdfFilesBase64.length === 0) return res.status(400).json({ error: 'No PDFs provided.' });

    const promptText = `You are a data extraction assistant. Extract details from the attached PDF documents for each customer/order found: Full Name, Phone No, Address, Order Source.

CRITICAL RULES:
1. ONLY extract the RECIPIENT / CUSTOMER information (typically found under 'Deliver To', 'Ship To', 'Consignee', or 'Buyer Details').
2. NEVER extract names, addresses, or phone numbers from "Shipped By", "From", "Sender", "Sold By", "Return Address", or courier/helpline sections.
3. If the customer's phone number is not explicitly listed in their delivery/recipient section, leave "PhoneNo" as an empty string "". Under no circumstance should you fall back to or substitute the sender/shipper's phone number.
4. If any other field (Full Name, Address, Order Source) is missing, leave that value as an empty string "".

Return the data STRICTLY as a JSON array of objects with the exact keys: "FullName", "PhoneNo", "Address", "OrderSource".`;

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
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`, {
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
        
        // Ensure missing or null phone numbers default to empty strings
        const cleanedDetails = extractedDetails.map(item => ({
            FullName: item.FullName || '',
            PhoneNo: item.PhoneNo || '',
            Address: item.Address || '',
            OrderSource: item.OrderSource || ''
        }));

        return res.status(200).json(cleanedDetails);

    } catch (error) {
        console.error("Extraction error:", error);
        return res.status(500).json({ error: error.message || 'Failed to process PDFs' });
    }
}
