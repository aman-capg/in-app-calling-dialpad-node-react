import React, { useEffect, useState } from 'react';
import { doc, setDoc, onSnapshot } from "firebase/firestore";
import { db, setupNotifications } from '../fireabase_helper';
import '../css/DialPad.css';
import StatusBar from './StatusBar';
import DigitGrid from './DigitGrid';
import NumberInput from './NumberInput';
import CallControlButton from './CallControlButton';
import CallIcon from '@mui/icons-material/Call';
import CallEndIcon from '@mui/icons-material/CallEnd';
import ShortcutOutlinedIcon from '@mui/icons-material/ShortcutOutlined';
import { BandwidthUA } from '@bandwidth/bw-webrtc-sdk';
import { useStopwatch } from 'react-timer-hook';
import { Button } from '@mui/material';

export default function DialPad() {
  const userId = process.env.REACT_APP_ACCOUNT_USERNAME;
  const authToken = process.env.REACT_APP_AUTH_TOKEN;
  const sourceNumber = userId;

  const { totalSeconds, seconds, minutes, hours, start, pause, reset } = useStopwatch({ autoStart: false });

  const [destNumber, setDestNumber] = useState('');
  const [webRtcStatus, setWebRtcStatus] = useState('Idle');
  const [callStatus, setCallStatus] = useState('Add Number');
  const [destNumberValid, setDestNumberValid] = useState(false);
  const [allowHangup, setAllowHangup] = useState(false);
  const [phone, setPhone] = useState(new BandwidthUA());
  const [activeCall, setActiveCall] = useState(null);
  const [callConfirmed, setCallConfirmed] = useState(false);
  const [dialedNumber, setDialedNumber] = useState(destNumber);
  const [allowBackspace, setAllowBackspace] = useState(false);
  const [allowMute, setAllowMute] = useState(false);
  const [allowHold, setAllowHold] = useState(false);
  const [onMute, setOnMute] = useState(false);
  const [onHold, setOnHold] = useState(false);
  const [fbStatusUpdated, updateFBStatus] = useState('Idle');
  const [fbToken, setFBToken] = useState('');
  const [incomingCall, setIncomingCall] = useState(false);
  const [initiateCall, setCallInitiate] = useState(false);
  const [incomingPayload, setIncomingPayload] = useState({});

  useEffect(() => {
    setupNotifications((token) => {
      console.log("FCM token:" + token);
      if (token != null) {
        setFBToken(token);
      } else {
        setFBToken(token);
      }
    }, (msg) => {
      console.log('Foreground Notification: ', msg);
      setIncomingPayload(msg.data);
      setIncomingCall(true);
      updateFBStatus('Ringing');
    });
  }, []);

  useEffect(() => {
    onSnapshot(doc(db, "agents", userId),
      (snapshot) => {
        if (snapshot.exists()) {
          var payload = snapshot.data();
          if (payload.callInBackground && document.visibilityState === 'hidden') {
            setIncomingPayload(payload.callInBackground);
            setIncomingCall(true);
            updateFBStatus('Ringing');
          }
        }
      });
  }, [])

  useEffect(() => {
    const serverConfig = {
      domain: 'gw.webrtc-app.bandwidth.com',
      addresses: ['wss://gw.webrtc-app.bandwidth.com:10081'],
      iceServers: [
        'stun.l.google.com:19302',
        'stun1.l.google.com:19302',
        'stun2.l.google.com:19302',
      ],
    };
    const newPhone = new BandwidthUA();
    console.log(`version: `, newPhone.version());
    newPhone.setWebSocketKeepAlive(5, false, false, 5, true);
    newPhone.setServerConfig(
      serverConfig.addresses,
      serverConfig.domain,
      serverConfig.iceServers,
    );

    //overriding the SDK logs
    newPhone.setBWLogger((...e) => {
      console.log(...e);
    });

    newPhone.checkAvailableDevices();
    newPhone.setAccount(`${sourceNumber}`, 'In-App Calling Sample', '');
    newPhone.setOAuthToken(authToken);
    newPhone.init();
    setPhone(newPhone);
  }, []);

  useEffect(() => {
    phone.setListeners({
      loginStateChanged: function (isLogin, cause) {
        // eslint-disable-next-line default-case
        switch (cause) {
          case 'connected':
            break;
          case 'disconnected':
            console.log('phone>>> loginStateChanged: disconnected');
            if (phone.isInitialized()) {
              // after deinit() phone will disconnect SBC.
              console.log('Cannot connect to SBC server');
            }
            break;
          case 'login failed':
            console.log('phone>>> loginStateChanged: login failed');
            break;
          case 'login':
            console.log('phone>>> loginStateChanged: login');
            break;
          case 'logout':
            console.log('phone>>> loginStateChanged: logout');
            break;
        }
      },

      outgoingCallProgress: function (call, response) {
        updateFBStatus("Call-Initiate");
      },

      callTerminated: function (call, message, cause) {
        if (call !== activeCall) {
          console.log('terminated no active call');
        }
        updateFBStatus("Idle");
        setAllowHangup(false);
        setActiveCall(null);
        setCallStatus('Add Number');
        setWebRtcStatus('Idle');
        setAllowBackspace(true);
        setAllowHold(false);
        setAllowMute(false);
        setOnHold(false);
        setOnMute(false);
        setCallConfirmed(false);
        console.log(`Call terminated: ${cause}`);        
      },

      callConfirmed: function (call, message, cause) {
        console.log('phone>>> callConfirmed');
        console.log("Call: ", call);
        console.log("Message: ", message);
        console.log("Cause: ", cause);
        updateFBStatus("In-Call");
        setAllowHangup(true);
        setAllowMute(true);
        setAllowHold(true);
        setWebRtcStatus('Connected');
        setCallConfirmed(true);
        activeCall.muteAudio(false);
        start();
      },

      callShowStreams: function (call, localStream, remoteStream) {
        console.log('phone>>> callShowStreams');
        let remoteVideo = document.getElementById('remote-video-container');
        if (remoteVideo != undefined) {
          remoteVideo.srcObject = remoteStream;
        }
      },

      incomingCall: function (call, invite) {
        console.log('phone>>> incomingCall');
        call.reject();
      },

      callHoldStateChanged: function (call, isHold, isRemote) {
        console.log(`phone>>> callHoldStateChanged to ${isHold ? 'hold' : 'unhold'}`);
      }
    });
  }, [phone, activeCall]);

  useEffect(() => {
    destNumber.length > 7 ? setDestNumberValid(true) : setDestNumberValid(false);
    destNumber.length > 0 ? setAllowBackspace(true) : setAllowBackspace(false);
    setDestNumber(destNumber.replace(/\D/g, ''));
  }, [destNumber]);

  useEffect(() => {
    if (activeCall === null) { pause(); }
  }, [activeCall]);

  useEffect(() => {
    if (callConfirmed) {
      const formatTime = (time) => time.toLocaleString('en-US', { minimumIntegerDigits: 2, useGrouping: false });
      setCallStatus(`${formatTime(hours)}:${formatTime(minutes)}:${formatTime(seconds)}`);
    }
  }, [totalSeconds]);

  useEffect(() => {
    if (callConfirmed) {
      if (onHold && onMute) {
        setWebRtcStatus('On Hold');
      } else if (onHold && !onMute) {
        setWebRtcStatus('On Hold');
      } else if (!onHold && onMute) {
        setWebRtcStatus('On Mute');
      } else if (!onHold && !onMute) {
        setWebRtcStatus('Connected');
      }
    }
  }, [onHold, onMute]);

  useEffect(() => {
    async function updateStatus() {
      const payload = {
        status: fbStatusUpdated,
        token: fbToken
      };
      try {
        const docRef = await setDoc(doc(db, "agents", userId), payload, { merge: fbStatusUpdated != 'Idle' });       
      } catch (e) {
        console.error("Error adding document: ", e);        
      }
    }
    updateStatus();
  }, [fbStatusUpdated, fbToken]);

  useEffect(() => {
    if (initiateCall) {
      handleDialClick();
    }
    setCallInitiate(false);
  }, [initiateCall]);

  const handleDigitClick = (value) => {
    activeCall ? activeCall.sendDTMF(value) : setDestNumber((destNumber) => destNumber.concat(value));
  }

  const handlePhoneNumber = (e) => {
    setDestNumber(e.target.value.replace(/\D/g, ''));
  };

  const handleBackspaceClick = () => {
    setDestNumber((destNumber) => destNumber.slice(0, -1));
  };

  const handleAcceptClick = () => {    
    setDestNumber(`${incomingPayload.fromNo.replace(/\D/g, '')}`);
    setIncomingCall(false);
    setIncomingPayload({});
    updateFBStatus("In-Call");
    setCallInitiate(true);
  }

  const handleDeclinedClick = () => {
    updateFBStatus("Idle");
    setIncomingCall(false);
    setIncomingPayload({});
  }

  const handleDialClick = () => {
    if (phone.isInitialized()) {
      updateFBStatus("Calling");
      setCallStatus('Calling');
      setWebRtcStatus('Ringing');
      let extraHeaders = [`User-to-User:eyJhbGciOiJIUzI1NiJ9.WyJoaSJd.-znkjYyCkgz4djmHUPSXl9YrJ6Nix_XvmlwKGFh5ERM;encoding=jwt;aGVsbG8gd29ybGQ;encoding=base64`];
      console.log("Dialed number: ", destNumber);
      phone.makeCall(`${destNumber}`, extraHeaders).then((value) => {
        setActiveCall(value);
      });
      setDialedNumber(`+${destNumber}`);
      setAllowHangup(true);
      setAllowBackspace(false);
      reset();
    } else {
      //console.error("BandwithUA not initialized!");
    }
  };

  const handleHangUpClick = () => {
    if (activeCall) {
      activeCall.terminate();
      setAllowHangup(false);
      pause();
    }
  };

  const handleHoldClick = () => {
    if (activeCall) {
      if (activeCall.isLocalHold()) {
        activeCall.hold(false);
        setOnHold(false);
      } else {
        activeCall.hold(true);
        setOnHold(true);
      }
    }
  };

  const handleMuteClick = () => {
    if (activeCall) {
      if (activeCall.isAudioMuted()) {
        activeCall.muteAudio(false);
        setOnMute(false);
      } else {
        activeCall.muteAudio(true);
        setOnMute(true);
      }
    }
  };

  const statusBarProps = {
    muteClick: handleMuteClick,
    holdClick: handleHoldClick,
    webRtcStatus,
    allowMute,
    allowHold,
    onMute,
    onHold
  };

  const numberInputProps = {
    onChange: handlePhoneNumber,
    value: destNumber
  };

  const endCallButtonProps = {
    type: 'end-call',
    onClick: handleHangUpClick,
    disabled: !allowHangup,
    Icon: CallEndIcon
  };

  const startCallButtonProps = {
    type: 'start-call',
    onClick: handleDialClick,
    disabled: !destNumberValid,
    Icon: CallIcon
  };

  const backspaceButtonProps = {
    type: 'backspace',
    onClick: handleBackspaceClick,
    disabled: !allowBackspace,
    Icon: ShortcutOutlinedIcon,
    iconColor: 'var(--blue65)',
    fontSize: 'small'
  };

  function renderUI() {
    if (incomingCall) {
      return <div style={{ backgroundColor: "black", padding: "80px 40px", borderRadius: "10px", textAlign: "center" }}>
        <h2 style={{ color: "white" }}>Incoming call</h2>
        <h3 style={{ color: "white" }}>Call from: {incomingPayload.fromNo}...</h3>
        <div style={{ textAlign: "center" }}><Button style={{ backgroundColor: "white", marginRight: "20px" }} color='error' onClick={handleDeclinedClick}>Reject</Button><Button style={{ backgroundColor: "white" }} onClick={handleAcceptClick}>Accept</Button></div>
      </div>;
    } else {
      return <div>
        <StatusBar {...statusBarProps} />
        <div className='dialpad-container'>
          <h2>{callStatus}</h2>
          {!allowHangup ? <NumberInput {...numberInputProps} /> : <div className='dialed-number'>{dialedNumber}</div>}
          <DigitGrid onClick={handleDigitClick} />
          <div className='call-controls'>
            <div className='call-start-end'>
              {!allowHangup ? <CallControlButton {...startCallButtonProps} /> : <CallControlButton {...endCallButtonProps} />}
            </div>
            <CallControlButton {...backspaceButtonProps} />
          </div>
          <video autoPlay id='remote-video-container' style={{ display: 'none' }}></video>
        </div>
      </div>;
    }
  }

  return (
    <div>
      {renderUI()}
    </div>
  )
}
