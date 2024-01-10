# 2DPaaS-InteractiveHuman-WebDemo

## 简介
![流程](res/2DPaaS-DH-RTC.png)

1. 【Web】获取本地SDP(记为`local_sdp`)
2. 【接口请求】session/start 选择协议`webrtc`，并携带`local_sdp`信息
    ```js
    let data = {
        "virtualmanKey":`${virtualmanKey}`,
        "protocol":"webrtc",
        "localSDP": `${loca_sdp}`
    }
    ```
3. 解析response中的`playStreamAddr`作为 `remote_sdp`
4. 使用`remote_sdp`连接webrtc

## require
`npm`

## 安装依赖：
```bash
npm install live-server@latest
```

## 启动网页：
```bash
live-server
```