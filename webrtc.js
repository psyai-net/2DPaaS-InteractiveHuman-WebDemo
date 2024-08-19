document.getElementById('startButton').addEventListener('click', startWebRTC);
document.getElementById('sendMessageButton').addEventListener('click', sendMessage);
document.getElementById('stopButton').addEventListener('click', endSession);

const ak = "N8v8gfwkZBDC9Q4IKvB5lbJqtbxCr6rn";
const uid = "6492761184d0ff378d61b80d";
const sk = "B4vrRbyeODAF1H6svj0txqYfaxRlv3N3LInCYePpsSs8Phk1hY7m3EBXm2tZe7lw"; // 请替换为您的实际 secret key

let peerConnection;
let localOffer;
let websocket;
let sessionId;

document.querySelectorAll('.image-section img').forEach(img => {
    img.addEventListener('click', (event) => {
        document.querySelectorAll('.image-section img').forEach(img => img.classList.remove('selected'));
        event.target.classList.add('selected');
    });
});

function formatContent(ak, uid, timeStamp) {
    return `ak=${ak}&uid=${uid}&timestamp=${timeStamp}`;
}
async function generateSignature(content, sk) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw", 
        encoder.encode(sk), 
        { name: "HMAC", hash: "SHA-256" },
        false, 
        ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(content));
    return Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

async function getAkAndSig() {
    const t = Math.floor(Date.now() / 1000);
    const content = formatContent(ak, uid, t);
    const sig = await generateSignature(content, sk);
    return { ak, sig, timeStamp: t };
}

async function fetchStreamStart(localSDP, virtualmanKey) {
    const { ak, sig, timeStamp } = await getAkAndSig();
    const url = `https://dev.api.psyai.net/v1/jobgate/stream/session/start?channel=youhang1&ak=${ak}&sig=${sig}&timeStamp=${timeStamp}`;
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'uid': uid,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                "virtualmanKey": virtualmanKey,
                "protocol": "webrtc",
                "localSDP": localSDP
            })
        });

        const data = await response.json();
        console.log('Stream start fetch response:', data);

        // 依据code -1和msg为OK判断成功
        if (data.code === -1 && data.msg === "OK") {
            return data.data;
        } else {
            // 打印详细的错误信息
            console.error('Stream start error:', data);
            throw new Error(data.msg || 'Error fetching stream start');
        }

    } catch (error) {
        console.error('Error in fetchStreamStart:', error);
        throw error;
    }
}

async function fetchStreamDrive(sessionId, virtualmanKey) {
    const { ak, sig, timeStamp } = await getAkAndSig();
    const url = `https://dev.api.psyai.net/v1/jobgate/stream/session/drive?channel=youhang&ak=${ak}&sig=${sig}&timeStamp=${timeStamp}`;
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'uid': uid,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                "sessionId": sessionId,
                "virtualmanKey": virtualmanKey
            })
        });

        const data = await response.json();
        console.log('Stream drive fetch response:', data);

        // 依据code -1和msg为OK判断成功
        if (data.code === -1 && data.msg === "OK") {
            return data.data;
        } else {
            // 打印详细的错误信息
            console.error('Stream drive error:', data);
            throw new Error(data.msg || 'Error fetching stream drive');
        }

    } catch (error) {
        console.error('Error in fetchStreamDrive:', error);
        throw error;
    }
}

async function prepareSDP(virtualmanKey) {
    const config = {
        iceServers: [],
        rtcpMuxPolicy: "require",
        tcpCandidatePolicy: "disable",
        iceTransportsType: "nohost",
        sdpSemantics: 'unified-plan'
    };

    const optional = {
        optional: [{
            DtlsSrtpKeyAgreement: true
        }]
    };

    const offerSdpOption = {
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        voiceActivityDetection: false
    };

    peerConnection = new RTCPeerConnection(config, optional);
    peerConnection.onicecandidate = e => console.log("peerConnection.onicecandidate:", e);
    peerConnection.onaddstream = e => console.log("peerConnection.onaddstream");
    peerConnection.onremovestream = e => console.log("peerConnection.onremovestream");

    peerConnection.ontrack = (event) => {
        console.warn('Received remote track:', event.track);
        const [remoteStream] = event.streams;
        const remoteVideo = document.getElementById('remoteVideo');
        if (remoteVideo.srcObject !== remoteStream) {
            remoteVideo.srcObject = remoteStream;
            console.log('Received remote stream');
        }
    };

    peerConnection.oniceconnectionstatechange = event => console.log('ICE connection state changed:', peerConnection.iceConnectionState);
    peerConnection.onicegatheringstatechange = event => console.log('ICE gathering state changed:', peerConnection.iceGatheringState);
    peerConnection.onsignalingstatechange = event => console.log('Signaling state changed:', peerConnection.signalingState);
    peerConnection.onconnectionstatechange = event => {
        console.log('Connection state changed:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'connected') {
            console.log('Peers connected!');
        }
    };

    try {
        const offer = await peerConnection.createOffer(offerSdpOption);
        console.log('Local SDP offer:', JSON.stringify(offer.sdp));

        const startData = await fetchStreamStart(offer.sdp, virtualmanKey);
        console.log('Start data received:', startData);

        sessionId = startData.sessionId; // 保持 sessionId 以备后用

        // 检查 playStreamAddr 内容
        console.log('playStreamAddr received:', startData.playStreamAddr);

        // 设置 local 和 remote SDP
        await peerConnection.setLocalDescription(offer);
        localOffer = offer;
        await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: startData.playStreamAddr }));

        await fetchStreamDrive(sessionId, virtualmanKey);
        console.log('Set remote description and drive session successfully.');

        await initializeWebSocket(sessionId, virtualmanKey);
    } catch (error) {
        console.error('There has been an error:', error);
    }
}


async function initializeWebSocket(sessionId, virtualmanKey) {
    const { ak, sig, timeStamp } = await getAkAndSig();
    const url = `wss://dev.api.psyai.net/v1/jobgate/stream/msg/send?sessionId=${sessionId}&vk=${virtualmanKey}&ak=${ak}&sig=${sig}&timeStamp=${timeStamp}&speakerId=640242b67c000a32e1ff0359&uid=${uid}`;
    websocket = new WebSocket(url);

    websocket.onopen = () => {
        console.log('WebSocket is open now.');
    };

    websocket.onmessage = (event) => {
        console.log('WebSocket message received:', event);
    };

    websocket.onclose = () => {
        console.log('WebSocket is closed now.');
    };

    websocket.onerror = (error) => {
        console.error('WebSocket error observed:', error);
    };
}

function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const messageText = messageInput.value;
    const message = {
        commandType: "SEND_AUDIO_TEXT",
        data: {
            text: messageText
        }
    };

    if (websocket && websocket.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify(message));
        console.log('Sent message:', message);

        messageInput.value = ""; // 清空输入框
    } else {
        console.error('WebSocket is not open.');
    }
}

async function fetchStreamStop(sessionId, virtualmanKey) {
    const { ak, sig, timeStamp } = await getAkAndSig();
    const url = `https://dev.api.psyai.net/v1/jobgate/stream/session/stop?channel=youhang1&ak=${ak}&sig=${sig}&timeStamp=${timeStamp}`
    try{
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'uid': uid,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                "virtualmanKey": virtualmanKey,
                "sessionId": sessionId
            })
        })
        const data = await response.json();
        console.log('Stream stop fetch response:', data);

        // 依据code -1和msg为OK判断成功
        if (data.code === -1 && data.msg === "OK") {
            return data.data;
        } else {
            // 打印详细的错误信息
            console.error('Stream stop error:', data);
            throw new Error(data.msg || 'Error fetching stream drive');
        }

    } catch(error) {
        console.error('Error in fetchStreamStop:', error);
        throw error;
    }
}

function endSession() {
    const selectedImage = document.querySelector('.image-section img.selected');
    const virtualmanKey = selectedImage ? selectedImage.getAttribute('data-virtualmankey') : null;

    if (sessionId && virtualmanKey) {
        fetchStreamStop(sessionId, virtualmanKey)
        .then(() => {
            console.log('Session ended successfully.');
            websocket.close();
            window.location.reload(); // 刷新页面返回首页
        })
        .catch(error => console.error('Error ending session:', error));
    } else {
        console.error('Session ID or virtualmanKey is missing.');
    }
}

async function startWebRTC() {
    const selectedImage = document.querySelector('.image-section img.selected');
    const virtualmanKey = selectedImage ? selectedImage.getAttribute('data-virtualmankey') : null;

    if (virtualmanKey) {
        await prepareSDP(virtualmanKey);
    } else {
        console.error('No virtualmanKey selected.');
    }
}
