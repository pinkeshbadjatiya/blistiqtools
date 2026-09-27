const fileInput = document.getElementById('file-input');
const folderInput = document.getElementById('folder-input');
const fileList = document.getElementById('file-list');
const fileCount = document.getElementById('file-count');
const mergeBtn = document.getElementById('merge-btn');
const statusText = document.getElementById('status');

// We maintain a single array of PDFs to merge, regardless of how they were selected
let pdfFilesToMerge = [];

// Helper function to update the UI list
function updateFileList(files) {
    pdfFilesToMerge = files;
    fileList.innerHTML = '';
    
    if (pdfFilesToMerge.length === 0) {
        fileCount.textContent = '';
        return;
    }

    fileCount.textContent = `${pdfFilesToMerge.length} PDF(s) ready to merge:`;
    
    pdfFilesToMerge.forEach(file => {
        const li = document.createElement('li');
        // If it came from a folder, show the relative path, otherwise just the name
        li.textContent = file.webkitRelativePath || file.name;
        fileList.appendChild(li);
    });
}

// Handle individual file selection
fileInput.addEventListener('change', () => {
    // Clear the folder input so the user isn't confused
    folderInput.value = ''; 
    
    const files = Array.from(fileInput.files).filter(file => 
        file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    );
    updateFileList(files);
});

// Handle folder selection
folderInput.addEventListener('change', () => {
    // Clear the file input so the user isn't confused
    fileInput.value = ''; 
    
    // Filter only PDFs from the entire folder structure
    let files = Array.from(folderInput.files).filter(file => 
        file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    );

    // Sort alphabetically by path to ensure consistent merge order
    files.sort((a, b) => {
        const pathA = a.webkitRelativePath || a.name;
        const pathB = b.webkitRelativePath || b.name;
        return pathA.localeCompare(pathB);
    });

    updateFileList(files);
});

mergeBtn.addEventListener('click', async () => {
    if (pdfFilesToMerge.length < 2) {
        statusText.textContent = "Please select at least 2 PDF files to merge.";
        statusText.className = "mt-4 text-center text-sm font-medium text-red-600 h-5";
        return;
    }

    statusText.textContent = "Merging... Please wait.";
    statusText.className = "mt-4 text-center text-sm font-medium text-blue-600 h-5";
    mergeBtn.disabled = true;
    mergeBtn.classList.add("opacity-50", "cursor-not-allowed");

    try {
        const { PDFDocument } = PDFLib;
        const mergedPdf = await PDFDocument.create();

        for (let i = 0; i < pdfFilesToMerge.length; i++) {
            const arrayBuffer = await pdfFilesToMerge[i].arrayBuffer();
            const pdf = await PDFDocument.load(arrayBuffer);
            const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            copiedPages.forEach((page) => mergedPdf.addPage(page));
        }

        const mergedPdfBytes = await mergedPdf.save();
        
        // Trigger download
        const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Merged_Document.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        statusText.textContent = "Merged successfully! Downloading...";
        statusText.className = "mt-4 text-center text-sm font-medium text-green-600 h-5";
    } catch (error) {
        console.error(error);
        statusText.textContent = "An error occurred while merging the files.";
        statusText.className = "mt-4 text-center text-sm font-medium text-red-600 h-5";
    } finally {
        mergeBtn.disabled = false;
        mergeBtn.classList.remove("opacity-50", "cursor-not-allowed");
    }
});
