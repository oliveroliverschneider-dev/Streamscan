# Setting up shared lists (Firebase)

About 5 minutes, free, using your Google account. Do this on a computer.

## 1. Create the project
1. Go to https://console.firebase.google.com and sign in with your Google account.
2. Click **Create a project** (or **Add project**). Name it `streamscan`.
3. When asked about Google Analytics, switch it **off**. Click **Create project**, then **Continue**.

## 2. Turn on the database
1. In the left menu open **Build → Firestore Database** and click **Create database**.
2. Location: choose **europe-west2 (London)**. Click **Next**.
3. Choose **Start in production mode** and click **Create**.
4. Open the **Rules** tab, delete everything in the box, paste the rules below, and click **Publish**.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /households/{code} {
      allow get: if code.matches('^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$');
      allow create, update: if code.matches('^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$')
        && request.resource.data.keys().hasOnly(['data', 'updated'])
        && request.resource.data.data is string
        && request.resource.data.data.size() < 500000;
    }
  }
}
```

These rules mean a phone can only open your lists if it knows your household code, and nobody can browse other households.

## 3. Get the two settings
1. Click the **gear icon** next to "Project Overview", then **Project settings**.
2. Under **Your apps**, click the **web icon** (`</>`).
3. Nickname: `Streamscan`. Leave "Firebase Hosting" unticked. Click **Register app**.
4. You'll see a block of code containing `firebaseConfig`. Copy the two values for
   **apiKey** and **projectId** and send them to Claude in the project thread.

These two values are meant to be public (they end up inside the web page), so it's fine to paste them in the chat. Your lists are protected by the household code, not by these.

## 4. After Claude switches it on
1. On your phone, open Streamscan from the home screen and tap **Start sharing**. A code like `ABCD-EFGH-JKMN` appears.
2. On Oliver's phone, open Streamscan from the home screen, type that code and tap **Join**.
3. That's it. Both phones now load and save the same lists automatically.
