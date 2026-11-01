CREATE TABLE local_test_messages (
 id TEXT PRIMARY KEY, delivered INTEGER NOT NULL, expires INTEGER NOT NULL, iv TEXT NOT NULL, ciphertext TEXT NOT NULL
);
CREATE TABLE local_inbox_nonces (nonce TEXT PRIMARY KEY, expires INTEGER NOT NULL);
CREATE TABLE support_requests (
 id TEXT PRIMARY KEY, actor TEXT NOT NULL, email TEXT NOT NULL, subject TEXT NOT NULL, message TEXT NOT NULL,
 received INTEGER NOT NULL, closed INTEGER, UNIQUE(actor,id)
);
CREATE INDEX support_pending ON support_requests(closed,received);
