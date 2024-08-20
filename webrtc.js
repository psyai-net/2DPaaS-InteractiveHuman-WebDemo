document.getElementById('startButton').addEventListener('click', handleStartButtonClick);
document.getElementById('sendMessageButton').addEventListener('click', sendMessage);
document.getElementById('stopButton').addEventListener('click', endSession);

const startButton = document.getElementById('startButton');
const loadingIndicator = document.getElementById('loading');


const ak = "N8v8gfwkZBDC9Q4IKvB5lbJqtbxCr6rn";
const uid = "6492761184d0ff378d61b80d";
const sk = "B4vrRbyeODAF1H6svj0txqYfaxRlv3N3LInCYePpsSs8Phk1hY7m3EBXm2tZe7lw";

let peerConnection;
let localOffer;
let websocket;
let sessionId;

async function handleStartButtonClick() {
    startButton.disabled = true; // 禁用按钮
    loadingIndicator.style.display = 'block'; // 显示加载提示
    try {
        await startWebRTC();
    } catch (error) {
        console.error('Error starting WebRTC session:', error);
        startButton.disabled = false; // 重启按钮，让用户可以重试
        loadingIndicator.style.display = 'none'; // 隐藏加载提示
    }
}

document.querySelectorAll('.image-section img').forEach(img => {
    img.addEventListener('click', (event) => {
        document.querySelectorAll('.image-section img').forEach(img => img.classList.remove('selected'));
        event.target.classList.add('selected');
        startButton.disabled = false; // 启用开始会话按钮
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

        if (data.code === -1 && data.msg === "OK") {
            return data.data;
        } else {
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

        if (data.code === -1 && data.msg === "OK") {
            return data.data;
        } else {
            console.error('Stream drive error:', data);
            throw new Error(data.msg || 'Error fetching stream drive');
        }

    } catch (error) {
        console.error('Error in fetchStreamDrive:', error);
        throw error;
    }
}

async function prepareSDP(virtualmanKey,speakerKey) {
    const config = {
        iceServers: [],
        rtcpMuxPolicy: "require",
        tcpCandidatePolicy: "disable",
        iceTransportsType: "nohost",
        sdpSemantics: 'unified-plan'
    };

    const optional = {
        optional: [{ DtlsSrtpKeyAgreement: true }]
    };

    const offerSdpOption = {
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        voiceActivityDetection: false
    };

    peerConnection = new RTCPeerConnection(config, optional);
    peerConnection.onicecandidate = e => console.log("peerConnection.onicecandidate:", e);
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

        await peerConnection.setLocalDescription(offer);
        localOffer = offer;
        await peerConnection.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: startData.playStreamAddr }));

        await fetchStreamDrive(sessionId, virtualmanKey);
        console.log('Set remote description and drive session successfully.');

        await initializeWebSocket(sessionId, virtualmanKey,speakerKey);
    } catch (error) {
        console.error('There has been an error:', error);
    }
}

async function initializeWebSocket(sessionId, virtualmanKey,speakerKey) {
    const { ak, sig, timeStamp } = await getAkAndSig();
    const url = `wss://dev.api.psyai.net/v1/jobgate/stream/msg/send?sessionId=${sessionId}&vk=${virtualmanKey}&ak=${ak}&sig=${sig}&timeStamp=${timeStamp}&speakerId=${speakerKey}&uid=${uid}`;
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

async function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const messageText = messageInput.value;
    const questionText = document.getElementById('questionText');
    const answerText = document.getElementById('answerText');

    if (!messageText) {
        console.error('No message text provided.');
        return;
    }

    questionText.textContent = `问题: ${messageText}`;

    try {
        const answer = await fetchKnowledgeBase(messageText);
        answerText.textContent = `回答: ${answer}`;
        
        const message = {
            commandType: "SEND_AUDIO_TEXT",
            data: { text: answer }
        };

        if (websocket && websocket.readyState === WebSocket.OPEN) {
            websocket.send(JSON.stringify(message));
            console.log('Sent message:', message);
            messageInput.value = ""; // 清空输入框
        } else {
            console.error('WebSocket is not open.');
        }
    } catch (error) {
        console.error('Error in fetch from knowledge base:', error);
        answerText.textContent = '回答: 获取回答失败';
    }
}

async function fetchKnowledgeBase(question) {
    const knowledgeBaseUrl = 'https://dev.api.psyai.net/web-tools/AI/knowledge_library/knowledge_base_chat/v2';
    const { ak, sig, timeStamp } = await getAkAndSig();
    let kwBaseId = uid + "_kw1";
    const response = await fetch(`${knowledgeBaseUrl}?ak=${ak}&sig=${sig}&timeStamp=${timeStamp}`, {
        method: 'POST',
        headers: {
            'uid': uid,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            query: question,
            knowledge_base_id: kwBaseId // 修改为你的知识库ID
        })
    });

    if (response.ok) {
        const data = await response.json();
        if (data.code === -1 && data.data && data.data.code === 200 && data.data.msg === "success") {
            return data.data.answer;
        } else {
            throw new Error('Failed to fetch from knowledge base: ' + (data.data ? data.data.msg : 'Unknown error'));
        }
    } else {
        throw new Error('Failed to fetch from knowledge base: Network response was not ok');
    }
}


async function fetchStreamStop(sessionId, virtualmanKey) {
    const { ak, sig, timeStamp } = await getAkAndSig();
    const url = `https://dev.api.psyai.net/v1/jobgate/stream/session/stop?channel=youhang1&ak=${ak}&sig=${sig}&timeStamp=${timeStamp}`;

    try {
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
        });

        const data = await response.json();
        console.log('Stream stop fetch response:', data);

        if (data.code === -1 && data.msg === "OK") {
            return data.data;
        } else {
            console.error('Stream stop error:', data);
            throw new Error(data.msg || 'Error stopping stream');
        }

    } catch (error) {
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
            if (websocket) {
                websocket.close();
            }
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
    const speakerKey = selectedImage ? selectedImage.getAttribute('data-speaker') : null;

    if (virtualmanKey) {
        try {
            await prepareSDP(virtualmanKey, speakerKey);
        } catch (error) {
            console.error('Error in prepareSDP:', error);
            throw error;
        } finally {
            startButton.disabled = false; // 请求完成后重新启用按钮
            loadingIndicator.style.display = 'none'; // 请求完成后隐藏加载提示
        }
    } else {
        console.error('No virtualmanKey selected.');
        startButton.disabled = false; // 如果没有选择虚拟人，重新启用按钮
        loadingIndicator.style.display = 'none'; // 隐藏加载提示
    }
}
