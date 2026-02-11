import pdf from "pdf-parse";
import fs from "fs";

export interface Chunk {
    text: string;
    metadata: {
        role: "admin" | "moderator" | "candidate" | "general";
        section: string;
        imageUrl?: string;
    };
}

export async function extractChunksFromPDF(filePath: string): Promise<Chunk[]> {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);
    const text = data.text;

    // Split into structural sections based on headers found in PDF analysis
    const sectionSplitter = /\n(?=Admin Registration|Login to TestiQo|Team Management & User Roles|Getting Started|Introduction to TestiQo)/;
    const sections = text.split(sectionSplitter);

    const chunks: Chunk[] = [];

    sections.forEach((sectionRaw) => {
        const section = sectionRaw.trim();
        if (!section) return;

        const lines = section.split("\n");
        const sectionName = lines[0].trim();
        let role: Chunk["metadata"]["role"] = "general";

        if (sectionName.toLowerCase().includes("registration") || sectionName.toLowerCase().includes("login")) {
            role = "general";
        } else if (sectionName.includes("Admin") || sectionName.includes("Team Management")) {
            role = "admin";
        } else if (sectionName.includes("Candidate")) {
            role = "candidate";
        } else if (sectionName.includes("Moderator") || sectionName.includes("Editor")) {
            role = "moderator";
        }

        // Detect images within this section
        const imageUrlMatch = section.match(/Image Link:\s*(https:\/\/ai-saturday\.s3[^\s]+)/gi);
        const imageUrls = imageUrlMatch ? imageUrlMatch.map(m => m.replace(/Image Link:\s*/i, "").trim()) : [];

        // Split section into smaller readable pieces (chunks)
        // We try to split by "Step X" or double newlines to keep instructions together
        const pieces = section.split(/\n(?=Step \d:)/);

        pieces.forEach((piece) => {
            // Find if this specific piece has an image link close to it
            const pieceImages = imageUrls.filter(url => piece.includes(url));
            const imageUrl = pieceImages.length > 0 ? pieceImages[0] : (imageUrls.length > 0 ? imageUrls[0] : undefined);

            // Clean up text by removing the explicit image link text
            const cleanText = piece.replace(/Image Link:\s*https:\/\/ai-saturday\.s3[^\s]+/gi, "").trim();

            if (cleanText.length > 10) {
                chunks.push({
                    text: cleanText,
                    metadata: {
                        role,
                        section: sectionName,
                        imageUrl,
                    },
                });
            }
        });
    });

    return chunks;
}
