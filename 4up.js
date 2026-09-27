const fileInput = document.getElementById('file-input');
const fileList = document.getElementById('file-list');
const convertBtn = document.getElementById('convert-btn');
const statusText = document.getElementById('status');

// Display selected files
fileInput.addEventListener('change', () => {
    fileList.innerHTML = '';
    Array.from(fileInput.files).forEach(file => {
        const li = document.createElement('li');
        li.textContent = file.name;
        fileList.appendChild(li);
    });
});

convertBtn.addEventListener('click', async () => {
    const files = fileInput.files;

    if (files.length === 0) {
        statusText.textContent = "Please select at least one PDF file.";
        statusText.className = "mt-4 text-center text-sm font-medium text-red-600 h-5";
        return;
    }

    statusText.textContent = "Processing... Please wait.";
    statusText.className = "mt-4 text-center text-sm font-medium text-blue-600 h-5";
    convertBtn.disabled = true;
    convertBtn.classList.add("opacity-50", "cursor-not-allowed");

    try {
        const { PDFDocument, PageSizes } = PDFLib;
        const outPdf = await PDFDocument.create();
        
        // A4 dimensions in points
        const A4_WIDTH = PageSizes.A4[0]; 
        const A4_HEIGHT = PageSizes.A4[1];

        let allEmbeddedPages = [];

        // 1. Loop through all selected files and collect their pages
        for (let i = 0; i < files.length; i++) {
            const arrayBuffer = await files[i].arrayBuffer();
            const srcPdf = await PDFDocument.load(arrayBuffer);
            const pages = srcPdf.getPages();
            
            // Embed pages into the new document directly from the source documents
            const embedded = await outPdf.embedPages(pages);
            allEmbeddedPages.push(...embedded);
        }

        // 2. Process all collected pages, 4 at a time
        for (let i = 0; i < allEmbeddedPages.length; i += 4) {
            const newPage = outPdf.addPage([A4_WIDTH, A4_HEIGHT]);

            // Define the bottom-left origins for the 4 quadrants
            const positions = [
                { x: 0, y: A4_HEIGHT / 2 },            // 1. Top-Left
                { x: A4_WIDTH / 2, y: A4_HEIGHT / 2 }, // 2. Top-Right
                { x: 0, y: 0 },                        // 3. Bottom-Left
                { x: A4_WIDTH / 2, y: 0 }              // 4. Bottom-Right
            ];

            for (let j = 0; j < 4; j++) {
                if (i + j < allEmbeddedPages.length) {
                    const embed = allEmbeddedPages[i + j];
                    
                    // Calculate scale to fit quadrant (with slight padding to prevent edges touching)
                    const padding = 10; 
                    const quadWidth = (A4_WIDTH / 2) - (padding * 2);
                    const quadHeight = (A4_HEIGHT / 2) - (padding * 2);
                    
                    const scale = Math.min(
                        quadWidth / embed.width,
                        quadHeight / embed.height
                    );

                    // Center the scaled page inside its quadrant
                    const scaledWidth = embed.width * scale;
                    const scaledHeight = embed.height * scale;
                    const offsetX = ((A4_WIDTH / 2) - scaledWidth) / 2;
                    const offsetY = ((A4_HEIGHT / 2) - scaledHeight) / 2;

                    newPage.drawPage(embed, {
                        x: positions[j].x + offsetX,
                        y: positions[j].y + offsetY,
                        xScale: scale,
                        yScale: scale
                    });
                }
            }
        }

        const outPdfBytes = await outPdf.save();
        
        // Trigger download
        const blob = new Blob([outPdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // Name the file differently depending on if 1 or multiple files were uploaded
        a.download = files.length > 1 ? 'Merged_4up.pdf' : files[0].name.replace('.pdf', '_4up.pdf');
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        statusText.textContent = "PDF generated successfully!";
        statusText.className = "mt-4 text-center text-sm font-medium text-green-600 h-5";
    } catch (error) {
        console.error(error);
        statusText.textContent = "An error occurred while processing the file(s).";
        statusText.className = "mt-4 text-center text-sm font-medium text-red-600 h-5";
    } finally {
        convertBtn.disabled = false;
        convertBtn.classList.remove("opacity-50", "cursor-not-allowed");
    }
});
