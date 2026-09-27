const fileInput = document.getElementById('file-input');
const folderInput = document.getElementById('folder-input');
const fileList = document.getElementById('file-list');
const fileCount = document.getElementById('file-count');
const mergeBtn = document.getElementById('merge-btn');
const statusText = document.getElementById('status');
const extractCheckbox = document.getElementById('extract-data');
const apiKeyContainer = document.getElementById('api-key-container');
const apiKeyInput = document.getElementById('api-key');

let pdfFilesToMerge = [];

// Load API key from local storage if available
if (localStorage.getItem('geminiApiKey')) {
    apiKeyInput.value = localStorage.getItem('geminiApiKey');
}

// Toggle API key visibility based on checkbox
extractCheckbox.addEventListener('change', () => {
    apiKeyContainer.classList.toggle('hidden', !extractCheckbox.checked);
});

// Update the UI list
function updateFileList(files) {
    pdfFilesToMerge = files;
    fileList.innerHTML = '';
    
    if (pdfFilesToMerge.length === 0) {
        fileCount.textContent = '';
        return;
    }
    fileCount.textContent = `${pdfFilesToMerge.length} PDF(s) ready to process:`;
    pdfFilesToMerge.forEach(file => {
        const li = document.createElement('li');
        li.textContent = file.webkitRelativePath || file.name;
        fileList.appendChild(li);
    });
}

// Handle inputs
fileInput.addEventListener('change', () => {
    folderInput.value = ''; 
    const files = Array.from(fileInput.files).filter(file => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
    updateFileList(files);
});

folderInput.addEventListener('change', () => {
    fileInput.value = ''; 
    let files = Array.from(folderInput.files).filter(file => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'));
    files.sort((a, b) => {
        const pathA = a.webkitRelativePath || a.name;
        const pathB = b.webkitRelativePath || b.name;
        return pathA.localeCompare(pathB);
    });
    updateFileList(files);
});

// Helper: Extract text from an ArrayBuffer using PDF.js
async function extractTextFromPDF(arrayBuffer) {
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map(item => item.str).join(' ') + '\n';
    }
    return fullText;
}

// Helper: Download CSV
function downloadCSV(dataArray, filename, columns) {
    const header = columns.map(c => c.title).join(',') + '\n';
    const rows = dataArray.map(obj => 
        columns.map(c => `"${(obj[c.key] || '').replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

mergeBtn.addEventListener('click', async () => {
    if (pdfFilesToMerge.length === 0) {
        statusText.textContent = "Please select PDF files.";
        statusText.className = "mt-4 text-center text-sm font-medium text-red-600 h-5";
        return;
    }

    const apiKey = apiKeyInput.value.trim();
    if (extractCheckbox.checked && !apiKey) {
        statusText.textContent = "Please provide a Gemini API Key to extract details.";
        statusText.className = "mt-4 text-center text-sm font-medium text-red-600 h-5";
        return;
    }

    if (apiKey) localStorage.setItem('geminiApiKey', apiKey);

    mergeBtn.disabled = true;
    mergeBtn.classList.add("opacity-50", "cursor-not-allowed");

    try {
        // --- 1. DETERMINE OUTPUT FILENAME ---
        let outputFileName = 'Merged-printout.pdf';
        if (pdfFilesToMerge[0].webkitRelativePath) {
            // Get the top-level folder name and replace spaces with hyphens
            const folderName = pdfFilesToMerge[0].webkitRelativePath.split('/')[0];
            outputFileName = folderName.replace(/\s+/g, '-') + '-printout.pdf';
        }

        // --- 2. EXTRACT TEXT & CALL GEMINI (If checked) ---
        if (extractCheckbox.checked) {
            statusText.textContent = "Extracting text from PDFs...";
            statusText.className = "mt-4 text-center text-sm font-medium text-purple-600 h-5";
            
            let combinedText = '';
            for (let i = 0; i < pdfFilesToMerge.length; i++) {
                const arrayBuffer = await pdfFilesToMerge[i].slice().arrayBuffer(); // Slice to clone buffer
                combinedText += `\n--- PDF ${i+1} ---\n`;
                combinedText += await extractTextFromPDF(arrayBuffer);
            }

            statusText.textContent = "Analyzing with Gemini AI...";
            
            const prompt = `Extract the following details from the text below for each order/customer found: Full Name, Phone No, Address, Order Source. 
            Return the data STRICTLY as a JSON array of objects with the keys: "FullName", "PhoneNo", "Address", "OrderSource". 
            If a detail is missing, leave the value as an empty string. 
            Text to analyze:
            ${combinedText}`;

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { response_mime_type: "application/json" }
                })
            });

            const aiData = await response.json();
            if (!response.ok) throw new Error(aiData.error?.message || "Gemini API Error");
            
            const extractedDetails = JSON.parse(aiData.candidates[0].content.parts[0].text);

            statusText.textContent = "Downloading CSVs...";
            
            // Download full details CSV
            downloadCSV(extractedDetails, 'full_details.csv', [
                { title: 'Full Name', key: 'FullName' },
                { title: 'Phone No', key: 'PhoneNo' },
                { title: 'Address', key: 'Address' },
                { title: 'Order Source', key: 'OrderSource' }
            ]);

            // Download Whatsapp Retargeting CSV
            downloadCSV(extractedDetails, 'upload_for_whatsapp_retarget.csv', [
                { title: 'Name', key: 'FullName' },
                { title: 'Phone no', key: 'PhoneNo' }
            ]);
        }

        // --- 3. MERGE PDFs ---
        statusText.textContent = "Merging PDFs... Please wait.";
        statusText.className = "mt-4 text-center text-sm font-medium text-blue-600 h-5";

        const { PDFDocument } = PDFLib;
        const mergedPdf = await PDFDocument.create();

        for (let i = 0; i < pdfFilesToMerge.length; i++) {
            const arrayBuffer = await pdfFilesToMerge[i].arrayBuffer();
            const pdf = await PDFDocument.load(arrayBuffer);
            const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            copiedPages.forEach((page) => mergedPdf.addPage(page));
        }

        const mergedPdfBytes = await mergedPdf.save();
        
        // Trigger PDF download
        const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = outputFileName; // Uses folder name with hyphens
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        statusText.textContent = "Process completed successfully!";
        statusText.className = "mt-4 text-center text-sm font-medium text-green-600 h-5";
    } catch (error) {
        console.error(error);
        statusText.textContent = error.message || "An error occurred during processing.";
        statusText.className = "mt-4 text-center text-sm font-medium text-red-600 h-5";
    } finally {
        mergeBtn.disabled = false;
        mergeBtn.classList.remove("opacity-50", "cursor-not-allowed");
    }
});
