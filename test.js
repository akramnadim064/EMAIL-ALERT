// index.test.js
const express = require('express');
const request = require('supertest');
const { google } = require('googleapis');
const twilio = require('twilio');
const app = require('./index.js'); // Import your express app from index.js

// Mock Twilio and Google APIs
jest.mock('twilio');
jest.mock('googleapis');

// Dummy Twilio client mock
const mockTwilioClient = {
    lookups: { v1: { phoneNumbers: { fetch: jest.fn().mockResolvedValue({ carrier: { type: 'mobile' } }) } } },
    messages: { create: jest.fn().mockResolvedValue({ sid: 'dummy-sid' }) }
};

// Mock the implementation of Twilio
twilio.mockImplementation(() => mockTwilioClient);

// Dummy Google API mock
const mockGmailClient = {
    users: {
        messages: {
            list: jest.fn().mockResolvedValue({ data: { messages: [{ id: '1' }] } }),
            get: jest.fn().mockResolvedValue({
                data: {
                    payload: {
                        headers: [
                            { name: 'From', value: 'sender@example.com' },
                            { name: 'Subject', value: 'Test Subject' }
                        ]
                    }
                }
            })
        }
    }
};
google.gmail.mockReturnValue(mockGmailClient);

describe('Dummy Tests for Twilio and Gmail Integration', () => {
    beforeEach(() => {
        jest.clearAllMocks(); // Clear any previous mock calls
    });

    it('should pass Twilio reads Gmail', async () => {
        // Simulate main function
        await app.main(); // Ensure this triggers email checking

        // Confirm Twilio was called for sending a message
        expect(mockTwilioClient.messages.create).toHaveBeenCalled();
        expect(mockTwilioClient.messages.create).toHaveBeenCalledWith(expect.objectContaining({
            body: expect.stringContaining('You have a new email from sender@example.com with subject: Test Subject')
        }));
    });

    it('should pass for valid Gmail account', async () => {
        await app.main(); // Ensure this triggers Gmail authorization

        // Check Gmail API interaction
        expect(mockGmailClient.users.messages.list).toHaveBeenCalled();
        expect(mockGmailClient.users.messages.get).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));
    });

    it('should confirm WhatsApp message sent', async () => {
        const message = 'You have a new email from sender@example.com with subject: Test Subject. View it here: https://mail.google.com/mail/u/0/#inbox/1';

        // Dummy MessageQueue for Twilio integration
        const messageQueue = new (require('./index.js').MessageQueue)(mockTwilioClient);
        messageQueue.enqueueMessage(message);

        // Process the queue to send the message
        await messageQueue.processQueue();

        expect(mockTwilioClient.messages.create).toHaveBeenCalledWith(expect.objectContaining({
            body: message,
            from: 'whatsapp:+14155238886',
            to: 'whatsapp:+918247580186'
        }));
    });
});









// describe("Twilio and Gmail Integration Tests", () => {


//     test("Twilio has read the Gmai", () => {
//       expect(true).toBe(true);  // This will always pass
//     });
//     test("The Gmail account is valid", () => {
//       expect(true).toBe(true);  // This will always pass
//     });
//     test("The message is shared on WhatsApp", () => {
//       expect(true).toBe(true);  // This will always pass
//     });
  





// });


  


