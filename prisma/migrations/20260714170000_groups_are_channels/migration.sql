UPDATE "MessagingConversation"
SET "type" = 'PRIVATE_CHANNEL'
WHERE "type" = 'GROUP';
