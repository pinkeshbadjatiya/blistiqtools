const fileInput = document.getElementById('file-input');
const folderInput = document.getElementById('folder-input');
const fileList = document.getElementById('file-list');
const fileCount = document.getElementById('file-count');
const mergeBtn = document.getElementById('merge-btn');
const statusText = document.getElementById('status');
const extractCheckbox = document.getElementById('extract-data');
const fitA4Checkbox = document.getElementById('fit-a4');
const addBorderCheckbox = document.getElementById('add-border');

let pdfFilesToMerge = [];

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

function downloadCSV(dataArray, filename, columns) {
    const header = columns.map(c => c.title).join(',') + '\n';
    const rows = dataArray.map(obj => 
        columns.map(c => `"${String(obj[c.key] || '').replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

mergeBtn.addEventListener('click', async () => {
    if (pdfFilesToMerge.length === 0) {
        statusText.textContent = "Please select PDF files.";
        statusText.className = "mt-4 text-center text-sm font-medium text-red-600 h-5";
        return;
    }

    mergeBtn.disabled = true;
    mergeBtn.classList.add("opacity-50", "cursor-not-allowed");

    try {
        let outputFileName = 'Merged-printout.pdf';
        if (pdfFilesToMerge[0].webkitRelativePath) {
            const folderName = pdfFilesToMerge[0].webkitRelativePath.split('/')[0];
            outputFileName = folderName.replace(/\s+/g, '-') + '-printout.pdf';
        }

        // AI Extraction
        if (extractCheckbox.checked) {
            statusText.textContent = "Preparing PDFs for AI analysis...";
            statusText.className = "mt-4 text-center text-sm font-medium text-purple-600 h-5";
            
            const arrayBufferToBase64 = (buffer) => {
                let binary = '';
                const bytes = new Uint8Array(buffer);
                for (let i = 0; i < bytes.byteLength; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                return btoa(binary);
            };

            let pdfBase64Array = [];
            for (let i = 0; i < pdfFilesToMerge.length; i++) {
                const arrayBuffer = await pdfFilesToMerge[i].slice().arrayBuffer();
                pdfBase64Array.push(arrayBufferToBase64(arrayBuffer));
            }

            statusText.textContent = "Analyzing PDFs with AI securely...";
            
            const response = await fetch('/api/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pdfFilesBase64: pdfBase64Array })
            });

            const aiData = await response.json();
            if (!response.ok) throw new Error(aiData.error || "Server Error");
            
            statusText.textContent = "Downloading CSVs...";
            
            downloadCSV(aiData, 'full_details.csv', [
                { title: 'Full Name', key: 'FullName' },
                { title: 'Phone No', key: 'PhoneNo' },
                { title: 'Address', key: 'Address' },
                { title: 'Order Source', key: 'OrderSource' }
            ]);

            downloadCSV(aiData, 'upload_for_whatsapp_retarget.csv', [
                { title: 'Name', key: 'FullName' },
                { title: 'Phone no', key: 'PhoneNo' }
            ]);
        }

        // PDF Merging & Formatting
        statusText.textContent = "Merging & Formatting PDFs... Please wait.";
        statusText.className = "mt-4 text-center text-sm font-medium text-blue-600 h-5";

        const { PDFDocument, PageSizes, rgb } = PDFLib;
        const mergedPdf = await PDFDocument.create();
        
        const fitA4 = fitA4Checkbox.checked;
        const addBorder = addBorderCheckbox.checked;

        for (let i = 0; i < pdfFilesToMerge.length; i++) {
            const arrayBuffer = await pdfFilesToMerge[i].arrayBuffer();
            const pdf = await PDFDocument.load(arrayBuffer);
            
            // Standard copy if formatting isn't requested
            if (!fitA4 && !addBorder) {
                const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                copiedPages.forEach((page) => mergedPdf.addPage(page));
            } else {
                // Apply specific scaling/border formatting
                const pages = pdf.getPages();
                const embeddedPages = await mergedPdf.embedPages(pages);
                
                embeddedPages.forEach(embed => {
                    let page;
                    let drawWidth = embed.width;
                    let drawHeight = embed.height;
                    let offsetX = 0;
                    let offsetY = 0;

                    if (fitA4) {
                        page = mergedPdf.addPage(PageSizes.A4);
                        // Scale uniformly to fit within A4
                        const scale = Math.min(PageSizes.A4[0] / embed.width, PageSizes.A4[1] / embed.height);
                        drawWidth = embed.width * scale;
                        drawHeight = embed.height * scale;
                        
                        // Center on page
                        offsetX = (PageSizes.A4[0] - drawWidth) / 2;
                        offsetY = (PageSizes.A4[1] - drawHeight) / 2;

                        page.drawPage(embed, {
                            x: offsetX,
                            y: offsetY,
                            xScale: scale,
                            yScale: scale
                        });
                    } else {
                        page = mergedPdf.addPage([embed.width, embed.height]);
                        page.drawPage(embed, {
                            x: 0,
                            y: 0,
                            xScale: 1,
                            yScale: 1
                        });
                    }

                    if (addBorder) {
                        // Inset the border by 1 point so it safely prints without getting clipped
                        const inset = 1; 
                        page.drawRectangle({
                            x: offsetX + inset,
                            y: offsetY + inset,
                            width: drawWidth - (inset * 2),
                            height: drawHeight - (inset * 2),
                            borderColor: rgb(0, 0, 0),
                            borderWidth: 1,
                        });
                    }
                });
            }
        }

        const mergedPdfBytes = await mergedPdf.save();
        
        const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = outputFileName;
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
