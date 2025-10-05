import { GoogleGenAI } from '@google/genai';
/**
 * What does this file do? 
 * Recommends best store considering price and distance.
 **/

export async function recommendStore(stores, userLocation, apiKey) {
    const ai = new GoogleGenAI(apiKey);

    const withDistances = stores.map(store => {
        const distance = sortByDistance(
            userLocation.lat,
            userLocation.lng,
            store.location.lat,
            store.location.lng
        );
        
        return {
            ...store,
            distance: distance
        };
    });

    const prompt = `You are a shopping assistant. Here are nearby stores:
    ${JSON.stringify(withDistances, null, 2)}
    
    User preference: Balanced savings and convenience.
    
    Recommend ONE to THREE stores and explain why in 2-3 sentences, considering price vs distance tradeoff.`;
        

    const contents = [
        {
            text: prompt
        }
    ]

    const recommendation = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: contents
    })

    return {
        stores: withDistances,
        recommendation: recommendation.text
    }
}

// Haversine formula to find shortest distance between two points (in km)
function sortByDistance(lat1, lng1, lat2, lng2) {

    // difference in latitude
    const dLat = (lat2 - lat1) * Math.PI / 180;
    // difference in longitude
    const dLng = (lng2 - lng1) * Math.PI / 180;

    // radius of earth
    const r = 6371;

    const a = Math.pow(Math.sin(dLat/2), 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.pow(Math.sin(dLng/2), 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return r * c;

}