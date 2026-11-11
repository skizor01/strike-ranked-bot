import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import {} from "../types/game.js";
import WebSocket from "ws";
const config = {
    apiKey: "AIzaSyDP4SIjKaw6A4c-zvfYxICpbEjn1rRnN50",
    authDomain: "shellshockio-181719.firebaseapp.com",
    databaseURL: "https://shellshockio-181719.firebaseio.com",
    projectId: "shellshockio-181719",
    storageBucket: "shellshockio-181719.appspot.com",
    messagingSenderId: "68327206324",
};
export function callAPI(request) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`wss://yolk.life/services/`, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            },
        });
        ws.on("open", () => {
            ws.send(JSON.stringify(request));
        });
        ws.on("message", (data) => {
            let response = null;
            try {
                response = JSON.parse(data.toString());
                // console.log(response);
                if (response.error) {
                    console.log(request.cmd + " error: " + JSON.stringify(response.error));
                    ws.close();
                    reject(response.error);
                    return;
                }
            }
            catch (err) {
                ws.close();
                console.error(err);
                reject(new Error("Error parsing response: " + data));
                return;
            }
            ws.close();
            resolve(response);
        });
    });
}
async function signInAnon(auth) {
    return new Promise((resolve, reject) => {
        signInAnonymously(auth).then((userCredentials) => {
            // console.log(userCredentials);
            onAuthStateChanged(auth, (user) => {
                // console.log(user)
                if (user) {
                    user.getIdToken(true).then((firebaseToken) => {
                        try {
                            callAPI({ cmd: "auth", firebaseToken }).then((value) => {
                                const account = value.playerOutput;
                                renewSesson(account);
                                resolve(account);
                            });
                        }
                        catch (e) {
                            console.log(e);
                        }
                    });
                }
            });
        });
    });
}
function renewSesson(account) {
    callAPI({ cmd: "renewSession", sessionId: account.sessionId })
        .then((res) => {
        // console.log(res);
        if (res.data === "renewed") {
            setTimeout(() => {
                renewSesson(account);
            }, 600_000); // 10 mins
        }
        console.log(res);
    })
        .catch(() => {
        setTimeout(() => {
            renewSesson(account);
        }, 30_000);
    });
}
export async function makeAccount() {
    // console.log("?")
    const app = initializeApp(config);
    const auth = getAuth(app);
    const account = await signInAnon(auth);
    return account;
}
makeAccount();
