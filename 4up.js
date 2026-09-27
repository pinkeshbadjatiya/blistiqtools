const fileInput = document.getElementById('file-input');
const fileNameDisplay = document.getElementById('file-name');
const convertBtn = document.getElementById('convert-btn');
const statusText = document.getElementById('status');

fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
        fileNameDisplay.textContent = `Selected: ${fileInput.files[0].name}`;
    } else {
        fileNameDisplay.textContent = '';
    }
});

convertBtn.addEventListener('click', async () => {
    if (fileInput.files.length === 0) {
        statusText.textContent = "Please select a PDF file first.";
        statusText.className = "mt-4 text-center text-sm font-medium text-red-600 h-5";
        return;
    }

    statusText.textContent = "Processing... Please wait.";
    statusText.className = "mt-4 text-center text-sm font-medium text-blue-600 h-5";
    convertBtn.disabled = true;
    convertBtn.classList.add("opacity-50", "cursor-not-allowed");

    try {
        const { PDFDocument, PageSizes } = PDFLib;
        const file = fileInput.files[0];
        const arrayBuffer = await file.arrayBuffer();
        
        const srcPdf = await PDFDocument.load(arrayBuffer);
        const outPdf = await PDFDocument.create();
        
        const pages = srcPdf.getPages();
        const embeddedPages = await outPdf.embedPages(pages);

        // A4 dimensions in points
        const A4_WIDTH = PageSizes.A4[0]; 
        const A4_HEIGHT = PageSizes.A4[1];

        // Process 4 pages at a time
        for (let i = 0; i < embeddedPages.length; i += 4) {
            const newPage = outPdf.addPage([A4_WIDTH, A4_HEIGHT]);

            // Define the bottom-left origins for the 4 quadrants
            // PDF coordinates start from bottom-left
            const positions = [
                { x: 0, y: A4_HEIGHT / 2 },            // 1. Top-Left
                { x: A4_WIDTH / 2, y: A4_HEIGHT / 2 }, // 2. Top-Right
                { x: 0, y: 0 },                        // 3. Bottom-Left
                { x: A4_WIDTH / 2, y: 0 }              // 4. Bottom-Right
            ];

            for (let j = 0; j < 4; j++) {
                if (i + j < embeddedPages.length) {
                    const embed = embeddedPages[i + j];
                    
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
        a.download = file.name.replace('.pdf', '_4up.pdf');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        statusText.textContent = "PDF generated successfully!";
        statusText.className = "mt-4 text-center text-sm font-medium text-green-600 h-5";
    } catch (error) {
        console.error(error);
        statusText.textContent = "An error occurred while processing the file.";
        statusText.className = "mt-4 text-center text-sm font-medium text-red-600 h-5";
    } finally {
        convertBtn.disabled = false;
        convertBtn.classList.remove("opacity-50", "cursor-not-allowed");
    }
});
