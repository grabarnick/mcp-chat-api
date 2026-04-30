import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const JAICP_TOKEN = process.env.JAICP_TOKEN;
const JAICP_HOST = process.env.JAICP_HOST || "bot.jaicp.com";

async function testDirect() {
    const url = `https://${JAICP_HOST}/chatapi/${JAICP_TOKEN}`;
    const query = 'адреса офисов в Беларуси';
    const clientId = 'test_debug';

    console.log(`Testing POST to ${url}`);
    try {
        const postRes = await axios.post(url, { query, clientId });
        console.log('POST Response Status:', postRes.status);
        console.log('POST Response Data:', JSON.stringify(postRes.data, null, 2));
    } catch (e) {
        console.error('POST Error:', e.response?.data || e.message);
    }

    console.log(`\nTesting GET to ${url}?query=${encodeURIComponent(query)}&clientId=${clientId}`);
    try {
        const getRes = await axios.get(`${url}?query=${encodeURIComponent(query)}&clientId=${clientId}`);
        console.log('GET Response Status:', getRes.status);
        console.log('GET Response Data:', JSON.stringify(getRes.data, null, 2));
    } catch (e) {
        console.error('GET Error:', e.response?.data || e.message);
    }
}

testDirect();
