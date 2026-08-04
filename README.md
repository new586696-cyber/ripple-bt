# Chatter Box Pro

Build a full-stack, production-quality chat application called [APP NAME — replace this].

Use Lovable Cloud (the built-in Supabase-based backend) for everything: Postgres for data, Supabase Auth for login, Supabase Storage for media, and Supabase Realtime for live updates. Enable it at the very start of the project — I want the database, auth, and storage all provisioned before we build any screens.

Auth

The ONLY sign-in method is Google Sign-In via Supabase Auth. No email/password, no magic links, no anonymous auth — disable every other provider.

Note for setup: Google sign-in requires an OAuth client (Client ID + Secret) from Google Cloud Console, added to the Supabase Auth provider settings. Walk me through this step when we get to it rather than assuming it's already configured.

On first sign-in, automatically create a profiles row for the new user using their Google profile data (name, email, avatar). Use a trigger on auth.users insert so this happens server-side, not from the client.

After sign-in, users land on the chat list screen. Signed-out users see a single clean "Sign in with Google" screen — no other options, no clutter.

Data model (Postgres via Supabase)

Use exactly this structure. Favor normalized relational tables over denormalized blobs — this is Postgres, not a document store.

profiles (one row per user, id = auth.users.id)

id (uuid, PK, references auth.users)

display_name, email, photo_url

status_message (text, default "Hey there! I'm using [APP NAME]")

created_at, last_seen (timestamptz)

chats

id (uuid, PK)

type: "direct" or "group"

direct_key (text, nullable) — for direct chats only: the two participant user IDs sorted alphabetically and joined with an underscore. Add a unique constraint on direct_key so a duplicate direct thread can never be created. Always check for an existing chat with this key before inserting a new one.

group_name, group_photo_url (nullable, group chats only)

last_message_text, last_message_sender_id, last_message_type, last_message_at — denormalized preview fields, kept in sync by a trigger (see below)

created_at, created_by

chat_participants (junction table — one row per user per chat)

chat_id (FK → chats), user_id (FK → profiles) — composite primary key

is_admin (boolean, default false) — group admins only; irrelevant for direct chats

last_read_at (timestamptz) — the last time this user opened the chat. Unread count for a chat = count of messages where created_at > last_read_at. This replaces manually incrementing a counter on every send.

joined_at (timestamptz)

messages

id (uuid, PK)

chat_id (FK → chats), sender_id (FK → profiles)

created_at (timestamptz, server-generated — never trust a client timestamp)

type: "text", "image", "voice", or "file"

text — message body, or caption for media messages

media_url — Storage path/URL (only for image/voice/file types)

media_meta (jsonb) — e.g. {mimeType, sizeBytes, durationSeconds, fileName}, only the fields relevant to the type

reply_to (uuid, nullable, FK → messages.id)

"Seen by" / read receipts: derive per-message read state by comparing each participant's chat_participants.last_read_at against the message's created_at — no need for a read_by array on every message row.

Supabase Storage bucket: chat-media, path convention chats/{chat_id}/{message_id}/{filename}.

Database trigger: AFTER INSERT on messages → update the parent chats row's last_message_* columns. Do this as a Postgres trigger function, not client-side, so it's atomic and consistent even if the client disconnects mid-send.

Realtime

Subscribe to Postgres changes (Supabase Realtime) on messages filtered by chat_id for the open chat screen.

Subscribe to changes on chats (filtered to chats the user participates in) for the chat list, so previews/ordering update live without a manual refresh.

Screens

Sign-in screen — Google sign-in button, app name/logo, nothing else.

Chat list screen — list of the user's chats ordered by last_message_at descending. Each row shows avatar, name (or group name), last message preview, timestamp, and an unread badge (computed from last_read_at, see above). A floating action button opens "new chat."

New chat screen — search existing users by name or email to start a direct chat (reuses the direct_key logic above so no duplicate threads are created); a separate flow to create a group by picking multiple users and naming the group.

Chat screen — message thread, newest at the bottom, live updates via Realtime. Input bar supports: text, image picker, voice recording (record-and-send, with playback in the bubble), and file attachment. Show read receipts and a "seen by" indicator for groups. Update chat_participants.last_read_at for the current user when the chat is opened.

Group info screen — group name/photo, member list, add/remove members (admins only), leave group.

Profile/settings screen — edit display name/photo/status message, sign out.

Design direction

Modern, minimal messenger aesthetic (think the clean parts of WhatsApp/Telegram, not a generic template). Mobile-first responsive layout. Clear visual distinction between your own messages and others' (bubble alignment/color). Use skeleton loaders for chat list and message history while data loads, and proper empty states ("no chats yet — start one" etc.), not blank screens.

Non-functional requirements

Write Postgres Row Level Security (RLS) policies for every table:

chats / messages / chat_participants: a user can only select rows for chats where they appear in chat_participants.

Only group admins (chat_participants.is_admin = true) can update group_name, group_photo_url, or add/remove members — enforce this either with a RLS WITH CHECK clause or a dedicated Postgres function/RPC that checks admin status before allowing the update.

messages insert: only allowed if sender_id = auth.uid() and the user is a participant of chat_id.

Storage policies on chat-media: only participants of the corresponding chat can read/write files under chats/{chat_id}/....

Handle errors gracefully everywhere (failed upload, offline state, permission denied) with visible, non-technical messages to the user.

Optimistic UI for sending messages — a message should appear instantly in the sender's view and reconcile once Postgres confirms the write (replace the temporary local ID with the real one, roll back cleanly on failure).

Build order (do this incrementally, don't try to do everything in one pass)

Enable Lovable Cloud, set up Google-only Supabase Auth, create the profiles table + trigger.

Chat list screen + starting a direct chat (with the direct_key uniqueness logic) + sending/receiving text messages in real time.

Image, voice, and file message types (upload to the chat-media bucket, render correctly in the bubble).

Group chats: creation, group info screen, admin controls.

Read receipts / unread counts (via last_read_at), RLS policies across all tables, polish/empty states.

Confirm each step works before moving to the next — verify the schema and RLS policies in the Supabase dashboard after step 1 especially. If something breaks, fix it before adding the next feature rather than layering more on top.


***************IMPORTANT***************
YOU WILL BE THE ONE TO CONNECT EVERYTHING EVEN THE GOOGLE AUTH AND THE REST  SO I DONT HAVE TO CONNECT ANYTHING ON MY SIDE

AND GIVE ME A FINAL PRODUCT AT THE END I SHOULD NOT BE IN A POSITION TO SEND ANOTHER CHAT
***************IMPORTANT***************

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://ripply.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/dd9e1c22-911c-4ce9-88cf-dce7d6126f52).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
