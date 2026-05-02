export interface YouTubeUploadOptions {
  title: string;
  description?: string;
  tags?: string[];
  privacyStatus?: 'private' | 'unlisted' | 'public';
  onProgress?: (percent: number) => void;
}

export interface YouTubeUploadResult {
  videoId: string;
  url: string;
}

export async function checkYouTubeConnected(): Promise<boolean> {
  try {
    const res = await fetch('/api/youtube/status');
    const data = await res.json();
    return data.connected === true;
  } catch {
    return false;
  }
}

export function openYouTubeAuth() {
  window.open('/api/youtube/auth', '_blank', 'width=600,height=700');
}

async function getAccessToken(): Promise<string> {
  const res = await fetch('/api/youtube/token');
  if (!res.ok) throw new Error('YouTube not connected. Please authorize first.');
  const data = await res.json();
  return data.access_token;
}

export async function uploadToYouTube(
  videoBlob: Blob,
  options: YouTubeUploadOptions
): Promise<YouTubeUploadResult> {
  const { title, description = '', tags = [], privacyStatus = 'private', onProgress } = options;

  const accessToken = await getAccessToken();

  // Step 1: Initiate resumable upload session
  const metadata = {
    snippet: { title, description, tags },
    status: { privacyStatus },
  };

  const initRes = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': 'video/mp4',
        'X-Upload-Content-Length': String(videoBlob.size),
      },
      body: JSON.stringify(metadata),
    }
  );

  if (!initRes.ok) {
    const err = await initRes.text();
    throw new Error(`Failed to initiate YouTube upload: ${err}`);
  }

  const uploadUrl = initRes.headers.get('Location');
  if (!uploadUrl) throw new Error('No upload URL returned from YouTube');

  // Step 2: Upload video with XHR for progress tracking
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', 'video/mp4');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 201) {
        const data = JSON.parse(xhr.responseText);
        resolve({
          videoId: data.id,
          url: `https://www.youtube.com/watch?v=${data.id}`,
        });
      } else {
        reject(new Error(`YouTube upload failed: ${xhr.status} ${xhr.responseText}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during YouTube upload'));
    xhr.send(videoBlob);
  });
}
