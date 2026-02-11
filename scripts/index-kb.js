const fs = require('fs');
const pdf = require('pdf-parse');
const https = require('https');

// Manual fallback for loading .env.local on Windows
if (fs.existsSync('.env.local')) {
    const content = fs.readFileSync('.env.local', 'utf8');
    content.split('\n').forEach(line => {
        const [key, ...values] = line.split('=');
        if (key && values.length > 0) {
            process.env[key.trim()] = values.join('=').trim();
        }
    });
}

const PINECONE_API_KEY = (process.env.PINECONE_API_KEY || '').trim();
const PINECONE_INDEX_NAME = (process.env.PINECONE_INDEX_NAME || '').trim();
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || '').trim();

if (!PINECONE_API_KEY || !PINECONE_INDEX_NAME || !OPENAI_API_KEY) {
    console.error('ERROR: Missing required environment variables.');
    process.exit(1);
}

function httpsRequest(url, options, body) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(JSON.parse(data));
                } else {
                    reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                }
            });
        });
        req.on('error', (e) => reject(e));
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function getEmbedding(text) {
    const url = 'https://api.openai.com/v1/embeddings';
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`
        }
    };
    const body = {
        model: 'text-embedding-3-large',
        input: text.replace(/\n/g, ' ')
    };
    return (await httpsRequest(url, options, body)).data[0].embedding;
}

async function getPineconeHost() {
    console.log(`Fetching Pinecone Host for: ${PINECONE_INDEX_NAME}`);
    const url = `https://api.pinecone.io/indexes/${PINECONE_INDEX_NAME}`;
    const options = {
        method: 'GET',
        headers: { 'Api-Key': PINECONE_API_KEY }
    };
    const res = await httpsRequest(url, options);
    return res.host;
}

async function upsertVectors(host, vectors) {
    const url = `https://${host}/vectors/upsert`;
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Api-Key': PINECONE_API_KEY
        }
    };
    return await httpsRequest(url, options, { vectors });
}

async function runIndexer() {
    try {
        console.log('--- STARTING HTTPS INDEXING ---');
        const host = await getPineconeHost();
        console.log('Target Host:', host);

        const dataBuffer = fs.readFileSync('TestiQo Knowledge Base.pdf');
        const data = await pdf(dataBuffer);
        const text = data.text;

        const sectionSplitter = /\n(?=Admin Registration|Login to TestiQo|Team Management & User Roles|Getting Started|Introduction to TestiQo)/;
        const sections = text.split(sectionSplitter);

        let totalUpserted = 0;

        for (const sectionRaw of sections) {
            const section = sectionRaw.trim();
            if (!section) continue;

            const lines = section.split('\n');
            const sectionName = lines[0].trim();
            let role = 'general';

            if (sectionName.toLowerCase().includes('registration') || sectionName.toLowerCase().includes('login')) {
                role = 'general';
            } else if (sectionName.includes('Admin') || sectionName.includes('Team Management')) {
                role = 'admin';
            } else if (sectionName.includes('Candidate') || sectionName.includes('Viewer')) {
                role = 'candidate';
            } else if (sectionName.includes('Editor')) {
                role = 'editor';
            }

            const imageUrlMatch = section.match(/Image Link:\s*(https:\/\/ai-saturday\.s3[^\s]+)/gi);
            const imageUrls = imageUrlMatch ? imageUrlMatch.map(m => m.replace(/Image Link:\s*/i, '').trim()) : [];

            const pieces = section.split(/\n(?=Step \d:)/);

            for (let i = 0; i < pieces.length; i++) {
                const piece = pieces[i];
                const pieceImages = imageUrls.filter(url => piece.includes(url));
                const imageUrl = pieceImages[0] || imageUrls[0] || '';
                const cleanText = piece.replace(/Image Link:\s*https:\/\/ai-saturday\.s3[^\s]+/gi, '').trim();

                if (cleanText.length < 10) continue;

                console.log(`Processing: ${sectionName} - Part ${i + 1}`);
                const embedding = await getEmbedding(cleanText);

                await upsertVectors(host, [{
                    id: `chunk-${Date.now()}-${totalUpserted}`,
                    values: embedding,
                    metadata: {
                        text: cleanText,
                        parentContext: section.replace(/Image Link:\s*https:\/\/ai-saturday\.s3[^\s]+/gi, '').trim(),
                        role,
                        section: sectionName,
                        imageUrl,
                    },
                }]);

                totalUpserted++;
                console.log(`Upserted ${totalUpserted} chunks...`);
            }
        }

        console.log(`--- INDEXING COMPLETE: ${totalUpserted} chunks stored ---`);
    } catch (error) {
        console.error('Indexing Error:', error.message);
    }
}

runIndexer().catch(err => console.error('Fatal Runner Error:', err.message));
