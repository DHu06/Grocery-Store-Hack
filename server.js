import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { identifyItem } from './image-analyzer.js';

const app = express()
const port = 3000

app.use(cors());
app.use(express.json({ limit: '10mb' })); 

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

app.post('/api/identify', async(req, res) => {
    try {
        const {image} = req.body;

        if (!image) {
            return res.status(400).json({
                success: false,
                error: 'No image provided'
            });
        }

        if (!process.env.GEMINI_API_KEY) {
            console.error('GEMINI_API_KEY not found in .env');
            return res.status(500).json({
                success: false,
                error: 'Server configuration error'
            });
        }

        const itemInfo = await identifyItem(image, process.env.GEMINI_API_KEY);
        
        res.json({
            success: true,
            item: itemInfo
        });

    } catch (error) {
        console.error('Error: ', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });

    }
});

app.post('api/sort-by-price', (req, res) => {
    try {
        const {stores} = req.body;
        if (!stores) {
            return res.status(400).json({
                success: false,
                error: 'Invalid stores data'
            })
        }
        const sorted = stores.sort((a,b) => a.price - b.price);

        res.json({
            success: true,
            stores: sorted
        })
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

app.post('api/sort-by-distance', (req, res) => {
    try {

    } catch {

    }
});
  
app.listen(port, () => {
    console.log(`Server listening on port ${port}`)
    console.log(`API: http://localhost:${port}`);
});
