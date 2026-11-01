CREATE TABLE member_preferences (
 user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
 time_zone TEXT NOT NULL
);
CREATE TABLE admin_unlocks (
 subject TEXT PRIMARY KEY, token_hash TEXT NOT NULL, last_counter INTEGER NOT NULL, expires INTEGER NOT NULL
);
CREATE TABLE delivery_holds (
 template_id TEXT PRIMARY KEY, audit_id TEXT NOT NULL
);
CREATE TABLE operator_audit (
 id TEXT PRIMARY KEY, operator TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, reason TEXT NOT NULL, created INTEGER NOT NULL
);
CREATE INDEX recent_audit ON operator_audit(created DESC);
