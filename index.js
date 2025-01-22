const express = require('express');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const twilio = require('twilio');

// Twilio credentials
require('dotenv').config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER;
const userWhatsAppNumber = process.env.USER_WHATSAPP_NUMBER;

console.log(accountSid, authToken, twilioWhatsAppNumber, userWhatsAppNumber); 


const credentialsPath = path.join(__dirname, 'credentials.json');
const tokenPath = path.join(__dirname, 'token.json');

const app = express();
const port = 3000;
app.use(express.json());

// API to set alert
app.post('/api/set-alert', async (req, res) => {
    const { email, whatsapp } = req.body;

    try {
        const phoneLookup = await twilio(accountSid, authToken).lookups.v1.phoneNumbers(whatsapp).fetch({ type: ['carrier'] });

        if (phoneLookup && phoneLookup.carrier && phoneLookup.carrier.type === 'mobile') {
            res.status(200).json({ message: 'Alert set successfully!' });
        } else {
            res.status(400).json({ message: 'Phone number is not registered on WhatsApp.' });
        }
    } catch (error) {
        console.error(error);
        res.status(400).json({ message: 'Phone number verification failed. Register on Twilio.' });
    }
});

// GmailService Class
class GmailService {
    constructor() {
        this.latestEmailId = '';
    }

    async authorize() {
        const credentials = JSON.parse(fs.readFileSync(credentialsPath));
        const { client_secret, client_id, redirect_uris } = credentials.web;
        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

        if (fs.existsSync(tokenPath)) {
            const token = JSON.parse(fs.readFileSync(tokenPath));
            oAuth2Client.setCredentials(token);
        } else {
            const url = oAuth2Client.generateAuthUrl({
                access_type: 'offline',
                scope: ['https://www.googleapis.com/auth/gmail.readonly'],
            });
            console.log('Authorize this app by visiting this url:', url);
            throw new Error('Token file not found. Run the token generation script first.');
        }
        return oAuth2Client;
    }

    async checkNewEmails(auth, enqueueMessage) {
        const gmail = google.gmail({ version: 'v1', auth });
        const res = await gmail.users.messages.list({ userId: 'me', maxResults: 10 });
        const emails = res.data.messages || [];

        if (emails.length > 0) {
            const newLatestEmailId = emails[0].id;

            if (newLatestEmailId !== this.latestEmailId) {
                this.latestEmailId = newLatestEmailId;

                try {
                    const email = await gmail.users.messages.get({ userId: 'me', id: newLatestEmailId, format: 'full' });
                    const headers = email.data.payload.headers;
                    
                    const subjectHeader = headers.find(header => header.name === 'Subject');
                    const fromHeader = headers.find(header => header.name === 'From');

                    const subject = subjectHeader ? subjectHeader.value : '(No subject)';
                    const from = fromHeader ? fromHeader.value : '(Unknown sender)';
                    const emailLink = `https://mail.google.com/mail/u/0/#inbox/${newLatestEmailId}`;
                    const message = `You have a new email from ${from} with subject: ${subject}. View it here: ${emailLink}`;
                    
                    enqueueMessage(message);
                } catch (error) {
                    console.error('Error fetching email details:', error.message);
                }
            }
        }
    }
}

// TwilioService Class
class TwilioService {
    constructor() {
        this.client = new twilio(accountSid, authToken);
        this.twilioWhatsAppNumber = twilioWhatsAppNumber;
        this.userWhatsAppNumber = userWhatsAppNumber;
    }

    async sendMessage(message) {
        try {
            const response = await this.client.messages.create({
                body: message,
                from: this.twilioWhatsAppNumber,
                to: this.userWhatsAppNumber
            });
            console.log('Message sent:', response.sid);
        } catch (error) {
            if (error.status === 429) {
                console.error('Rate limit exceeded:', error.message);
                throw error;
            } else {
                console.error('Failed to send message:', error.message);
            }
        }
    }
}

// MessageQueue Class
class MessageQueue {
    constructor(twilioService) {
        this.messagesQueue = [];
        this.isProcessing = false;
        this.twilioService = twilioService;
        this.RATE_LIMIT_DELAY_MS = 1000;
    }

    async processQueue() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        let retryDelay = this.RATE_LIMIT_DELAY_MS;

        while (this.messagesQueue.length > 0) {
            const message = this.messagesQueue.shift();

            try {
                await this.twilioService.sendMessage(message);
                retryDelay = this.RATE_LIMIT_DELAY_MS;
            } catch (error) {
                if (error.status === 429) {
                    console.error('Rate limit exceeded:', error.message);
                    this.messagesQueue.unshift(message);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    retryDelay *= 2;
                } else {
                    console.error('Failed to send message:', error.message);
                }
            }

            await new Promise(resolve => setTimeout(resolve, retryDelay));
        }

        this.isProcessing = false;
    }

    enqueueMessage(message) {
        this.messagesQueue.push(message);
        this.processQueue();
    }
}

async function main() {
    const gmailService = new GmailService();
    const twilioService = new TwilioService();
    const messageQueue = new MessageQueue(twilioService);

    const auth = await gmailService.authorize();
    setInterval(async () => {
        try {
            await gmailService.checkNewEmails(auth, (message) => messageQueue.enqueueMessage(message));
        } catch (error) {
            console.error('Error checking new emails:', error);
        }
    }, 6000);
}

main().catch(console.error);
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
