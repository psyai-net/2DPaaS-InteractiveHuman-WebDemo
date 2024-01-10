document.getElementById('startButton').addEventListener('click', startWebRTC);

let peerConnection;
let localOffer

prepareSDP()

async function prepareSDP() {
    var config = {
        iceServers: [],
        rtcpMuxPolicy: "require",
        tcpCandidatePolicy: "disable",
        IceTransportsType: "nohost",
        sdpSemantics: 'unified-plan'
    };

    var optional = {
        optional: [{
            DtlsSrtpKeyAgreement: true
        }]
    };

    var offerSdpOption = {
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        voiceActivityDetection: false
    };

    peerConnection = new RTCPeerConnection(config, optional);
    peerConnection.onicecandidate = function(e) {
        console.log("peerConnection.onicecandidate:", e);
    };
    peerConnection.onaddstream = function(e) {
        console.log("peerConnection.onaddstream");
    };
    peerConnection.onremovestream = function(e) {
        console.log("peerConnection.onremovestream");
    };

    // 当获取到远程媒体流的轨道时，将它们添加到video元素中
    peerConnection.ontrack = (event) => {
        console.warn('Received remote track:', event.track);
        const [remoteStream] = event.streams;
        const remoteVideo = document.getElementById('remoteVideo');
        if (remoteVideo.srcObject !== remoteStream) {
            remoteVideo.srcObject = remoteStream;
            console.log('Received remote stream');
        }
    };

    // 监听 ICE 连接状态变化事件
    peerConnection.oniceconnectionstatechange = (event) => {
        console.log('ICE connection state changed:', peerConnection.iceConnectionState);
    };

    // 监听 ICE 收集状态变化事件
    peerConnection.onicegatheringstatechange = (event) => {
        console.log('ICE gathering state changed:', peerConnection.iceGatheringState);
    };

    // 监听信令状态变化事件
    peerConnection.onsignalingstatechange = (event) => {
        console.log('Signaling state changed:', peerConnection.signalingState);
    };

    // 监听连接状态变化事件
    peerConnection.onconnectionstatechange = (event) => {
        console.log('Connection state changed:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'connected') {
            console.log('Peers connected!');
        }
    };

    peerConnection.createOffer(offerSdpOption).then(async function (offer) {
        console.warn(`${JSON.stringify(offer.sdp)}`)
        peerConnection.setLocalDescription(offer);
        localOffer = offer
    }).catch(function(reason) {
        console.log('create offer failed : reason = ' + reason);
    });
}

async function startWebRTC() {
    let offer = localOffer

    // 获取远程SDP，设置远程描述，并发送本地SDP到后端
    try {

        let remoteSdp = acquire()
        console.warn(`remote sdp: ${remoteSdp}`);
        await peerConnection.setRemoteDescription(new RTCSessionDescription({type: 'answer', sdp: remoteSdp}));
        console.log('Set remote description successfully.');
    } catch (error) {
        console.error('Failed to start WebRTC:', error);
    }
}

let acquire = ()=>{
    let remoteSdp = document.getElementById('remoteSdp').value;

    remoteSdp = remoteSdp.replace(/\\r\\n/g, "\r\n");
    return  remoteSdp
}
