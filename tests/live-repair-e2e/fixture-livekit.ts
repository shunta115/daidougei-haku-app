export class LiveKitClientError extends Error {}
export const liveKitErrorMessage=()=> 'QA: 実配信は接続していません'
export const liveMediaDeviceErrorMessage=()=> 'QA: カメラは使用しません'
export const fetchLiveKitStatus=async()=>({configured:true})
export const fetchLiveKitToken=async()=>({token:'qa',url:'qa'})
export async function connectAsViewer() {return {localParticipant:{connectionQuality:'excellent'},on(){},async disconnect(){},canPlaybackAudio:true,async startAudio(){},remoteParticipants:new Map()}}
export async function connectAsHost() {throw new Error('QA cannot publish')}
export const countViewers=()=>2
export const applyNetworkAdaptation=()=> 'QA'
export const watchRemoteMedia=()=>()=>{}
export const attachRemoteTrack=()=>{}
export const preferAudioOnly=()=>{}
export const restartHostCameraForOrientation=()=>{}
export const setHostCameraEnabled=()=>{}
export const setHostMicrophoneEnabled=()=>{}
