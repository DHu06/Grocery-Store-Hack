import { GoogleGenAI } from '@google/genai';
/**
 * What does this file do? 
 * Takes an image input, sends it to Gemini and returns back product info in JSON format.
 **/

export async function identifyItem(base64Image, apiKey) {
    const ai = new GoogleGenAI(apiKey);

    const contents = [
        {
            inlineData: {
                mimeType: "image/jpeg",
                data: base64Image,
            },
        },
        {
            text: `Identify this grocery product. You must respond with ONLY raw JSON, no markdown formatting, no code blocks, no backticks.
        
                Format:
                {
                "name":"product name",
                "brand":"brand name",
                "category":"category",
                "description":"brief description",
                "confidence":"high/medium/low"
                }
                
                Do not wrap the JSON in \`\`\`json or any other formatting. Return pure JSON only.`
        }
    ];
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contents
    });

    const productInfo = JSON.parse(response.text);
    return productInfo;
}