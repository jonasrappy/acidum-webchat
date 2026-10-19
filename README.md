# acidum-webchat

**[Open acidum](https://jonasrappy.github.io/acidum-webchat/)**

A lightweight webchat with mobile navigation and multiple accounts. Built with Svelte 5 and Vite, with no tracking or separate backend.

## Connect

1. Start acidum on your computer and enable webchat.
2. Sign in to [acidum](https://acium.app/) and open the webchat.
3. Copy the full webchat link from the address bar and paste it into this webchat.

The token link has the technical format `https://acium.app/chat?token=…`. It is saved on your device so the chat opens automatically next time. Temporary network errors do not remove it. If the server repeatedly closes the connection without sending data, you can retry the saved link. **Disconnect and remove login** clears it from the browser. The desktop app must keep running.

## Features

- On desktop, **All chats** opens a room overview with independent message panels. Accounts in the same known room share a panel. Panels keep a fixed order, and busy rooms cannot push quieter rooms out of the view. Choose **Timeline** for one chronological stream; the layout choice is saved on this device.
- Each desktop panel has a message field with its sender fixed to the corresponding account. Accounts sharing a room get separate fields below the shared conversation. Drafts stay separate and follow the account between desktop panels, the timeline, and mobile. Name suggestions use the room of the account you are writing as.
- Opening one account on desktop shows a live participant list beside the conversation. Hide or restore it with the participant button.
- View all conversations together or select one account. Mobile account tabs fit their names and keep the selected account visible when switching accounts or resizing the screen.
- Search loaded messages, filter by sender, or show whispers only. Active filters remain visible when search is closed and can be removed directly.
- Compact navigation, readable controls, keyboard shortcuts, and dialogs with fixed headers and close buttons. Help is available behind question-mark buttons. Connection settings are at the bottom of **More / Settings**; connection failures also appear in the chat.
- **Show room activity** controls whether people entering or leaving rooms, changing rooms, and other system events appear in the conversation. The choice is saved on this device and restored when the page reloads or reopens.
- Message text defaults to 16 px. Adjust it from 10 to 30 px under **Appearance**, with a preview in the help panel. The size is saved on your device.
- In **All**, copies of the same public room message received by multiple accounts appear once, with tags for each receiving account. Room context is recorded when messages arrive. Matching considers sender, type, text, and timestamp; copies from the same known room may differ by up to one second. Repeated messages from one account, different known rooms, and private messages stay separate.
- Consecutive room entries, room exits, and messages from the same person share one block, with the sender on the left and timestamps in a fixed column on the right. Each line keeps its own timestamp and actions. A green right arrow marks someone entering a room; a red left arrow marks someone leaving. Backgrounds alternate between blocks. A different sender, account, date, or room event starts a new block. Whispers stay separate from public messages.
- Trigger words are managed in the desktop app. The webchat respects its `log` and `notify` markers and also matches your account name without case sensitivity. Unread counts reflect these markers and name mentions, rather than ordinary room traffic. Server markers also apply to your own messages.
- Recent `notify` messages can produce an in-app banner, optional sound, and system notifications after permission is granted. Historical messages and old replays do not trigger alerts.
- The event log always retains the latest 100 events locally per login, without expiry and independently of optional chat history. Merged room copies count as one event. Old replays do not replace newer events, and restoring the log does not trigger alerts.
- Superusers have an orange name and border with a warm message background, including whispers and merged room copies. Identification uses received `superuser` fields and names in panic events. Without that information, the sender appears normally; message text is not used to guess roles.
- Room participant lists use `users` data received on room entry and update as people join and leave. Without a room snapshot, the list shows observed activity. After disconnection, it returns to observed status until another snapshot arrives.
- Tap a room-change message or its timestamp and choose **Follow as…** when the event includes a room ID. Known destination IDs appear in parentheses. Following sends `/goto <id>` as the account selected in the composer, whose name appears on the button. Drafts are preserved, and the server decides whether the account can enter the destination.
- Tap a name to mention someone or view their messages. This does not send a message automatically. Type `@` and part of a name for optional suggestions from the selected account's room. Choosing a suggestion inserts the name without `@`. Enter selects a suggestion only after you highlight it with the arrow keys.
- Drafts are saved locally for each account. Trigger settings are not stored in the webchat.
- Tap a timestamp to copy or save a message. Up to 200 saved messages are retained separately from rolling history.
- Export the loaded and filtered conversation as a text file, created directly in the browser.
- Send messages as the selected account, with a 100-character limit and a counter near the limit.
- Selecting an account hides the sender selector and expands the message field. Return to **All** to choose a sender again.
- Scroll up to load older messages while preserving your reading position. The optional local archive retains up to 10,000 messages per login.
- Automatic reconnection uses increasing delays with random variation.

## Language

The interface, help, notifications, demo conversations, and documentation are in English. Chat events and whisper prefixes keep their familiar Danish wording, including people entering or leaving rooms, room changes, and panic events. Dates use English formatting and a 24-hour clock. Account names, room names, and received message content remain unchanged.

Previously saved English chat events are restored to Danish while existing message identities are preserved, so history, saved messages, and replay detection remain compatible.

## Data and privacy

Everything acidum saves is stored in your browser: the login link, drafts, saved messages, the latest 100 log events, text size, room-activity visibility, desktop layout, participant-list visibility, notification preferences, and optional history. Local data is scoped to the current login using a SHA-256 identifier, keeping drafts, events, and saved messages from different logins separate. The token itself is stored separately in browser `localStorage`; older session storage is migrated automatically. If persistent storage is blocked, session storage is attempted instead.

To connect, the token and messages are sent directly to the chat server over an encrypted WebSocket. GitHub Pages only serves static site files. Chat data and passwords do not belong in the repository. Do not share your token link.

**Save history** is off by default. **Clear saved history** deletes the rolling archive for the current login; the event log, manually saved messages, and drafts remain. **Disconnect and remove login** removes the token but keeps local data. Clearing the browser's site data removes all local data.

## Performance and limitations

Memory retains up to 700 incoming messages per account. The timeline initially renders the latest 250 messages. The desktop overview divides that initial budget between its room panels, so each room keeps its latest messages even when another is busy. Older messages load per panel as you scroll up or select **Load older messages**. Live updates are batched with at least 80 ms between renders. Keyed Svelte components reuse unchanged message rows and sender groups. Message data uses raw reactive state without deep proxies. Dialogs and settings load on demand; archive code loads only when local history is used. Keyboard and viewport changes update layout and reading position. Activity in other conversations does not redraw the current message list. Hidden tabs defer rendering until visible. While you read older messages, incoming traffic does not redraw that conversation for every message. Other desktop panels continue updating independently. Only visible panels at the latest messages clear their accounts’ unread markers. A shared visibility observer covers the room panels; there are no observers per message.

The server protocol's `lastLine` request retrieves newer messages. No request for arbitrary older server history has been identified. Lazy loading therefore uses messages already received and the archive you choose to save locally. Search and export cover loaded messages; scroll up to load more from the archive.

Participant lists reflect the latest room snapshot and subsequent events. Missing data may leave them incomplete. Following someone requires a valid destination ID in the departure event; it is not guessed from the room name. Received whispers can be read and filtered.

Enable system notifications in **More / Settings**. On iPhone, add acidum to your Home Screen and open it from there before enabling notifications. Alerts require the page to keep receiving data through its chat connection. There is no push backend to wake a closed or suspended app. The small service worker only displays notifications from the active page and opens the relevant account; it does not cache chats or login links.

The integration uses an observed protocol and may need adjustments when the server changes. No specific CPU savings have been measured.

## Development and testing

Requires Node.js 22.12 or later.

```sh
npm ci
npm run check
npm test
npm run dev
```

Open http://127.0.0.1:8765. With no saved login, demo data is available at http://127.0.0.1:8765/#demo. Source code is in `src/`, component styles live alongside their components, and shared theme and layout rules are in `src/style.css`. The `public/` directory contains the icon, manifest, and service worker. `npm run build` writes the current production build to `dist/` and removes previous build output. `npm run preview` serves the built site locally.

Node tests cover history limits, deduplication, account isolation, mentions, server markers, alerts, grouping, participant lists, local storage, and compatibility with previously saved messages.

With a preview server running, `npm run test:browser` runs `tests/*.browser.cjs` using `playwright-core` and Chromium. Set `BROWSER_EXECUTABLE` to the browser executable path. `ACIDUM_TEST_URL` overrides the test URL. Browser tests use synthetic data. They cover mobile layouts, desktop room panels, independent reading positions, shared-room deduplication, live participant changes, touch targets, filters, dialog focus and scrolling, large text, connection feedback, storage, and chat behavior. The keyboard test simulates viewport height and offset changes, checks that the composer and conversation remain visible, and verifies that unchanged message rows are reused. A physical iPhone keyboard is not available in the test environment.

## Publishing

GitHub Pages serves the root of the `gh-pages` branch. Commit the updated source and build output before pushing:

```sh
npm run check
npm test
npm run build
git add -A
git commit -m "Update acidum"
git push origin main
git subtree push --prefix dist origin gh-pages
```
