import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Play, Square, Mic, Upload, FileSpreadsheet, AlertCircle, Volume2 } from 'lucide-react';

interface RowData {
  stt: string | number;
  hoTen: string;
  ngaySinh: string;
  _original: any;
}

export default function App() {
  const [data, setData] = useState<RowData[]>([]);
  const [speechRate, setSpeechRate] = useState<number>(1.0);
  const [availableVoices, setAvailableVoices] = useState<any[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>('');
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [status, setStatus] = useState<'idle' | 'reading' | 'listening'>('idle');
  const [error, setError] = useState<string>('');
  const [transcript, setTranscript] = useState<string>('');

  const currentIndexRef = useRef<number>(-1);
  const statusRef = useRef<'idle' | 'reading' | 'listening'>('idle');
  const dataRef = useRef<RowData[]>([]);
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    // Sử dụng list voice mặc định của OpenAI tương thích
    const openAIVoices = [
      { name: 'alloy', ssmlGender: 'Neutral' },
      { name: 'echo', ssmlGender: 'Male' },
      { name: 'fable', ssmlGender: 'Male' },
      { name: 'onyx', ssmlGender: 'Male' },
      { name: 'nova', ssmlGender: 'Female' },
      { name: 'shimmer', ssmlGender: 'Female' }
    ];
    setAvailableVoices(openAIVoices);
    setSelectedVoice('alloy');

    // Speech Recognition
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'vi-VN';

        recognition.onresult = (event: any) => {
          let currentTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            currentTranscript += event.results[i][0].transcript;
          }
          setTranscript(currentTranscript);

          const lowerTranscript = currentTranscript.toLowerCase();
          if (
            lowerTranscript.includes('ok') ||
            lowerTranscript.includes('oke') ||
            lowerTranscript.includes('ô kê') ||
            lowerTranscript.includes('tiếp') ||
            lowerTranscript.includes('rồi')
          ) {
            recognition.stop();
            if (statusRef.current === 'listening') {
              readRow(currentIndexRef.current + 1);
            }
          }
        };

        recognition.onerror = (event: any) => {
          console.error('Speech recognition error', event.error);
        };

        recognition.onend = () => {
          if (statusRef.current === 'listening') {
            try { recognition.start(); } catch (e) { }
          }
        };

        recognitionRef.current = recognition;
      }
    }

    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const jsonData = XLSX.utils.sheet_to_json(ws);

        const mappedData: RowData[] = jsonData.map((row: any, index) => {
          const keys = Object.keys(row);
          const sttKey = keys.find(k => k.toLowerCase().includes('stt') || k.toLowerCase().includes('thứ tự')) || keys[0];
          const nameKey = keys.find(k => k.toLowerCase().includes('tên') || k.toLowerCase().includes('họ')) || keys[1];
          const dobKey = keys.find(k => k.toLowerCase().includes('ngày') || k.toLowerCase().includes('sinh') || k.toLowerCase().includes('dob')) || keys[2];

          let dob = row[dobKey] || '';
          if (typeof dob === 'number') {
            const date = new Date(Math.round((dob - 25569) * 86400 * 1000));
            dob = date.toLocaleDateString('vi-VN');
          }

          return {
            stt: row[sttKey] || (index + 1),
            hoTen: row[nameKey] || '',
            ngaySinh: dob,
            _original: row
          };
        });

        setData(mappedData);
        setCurrentIndex(-1);
        setStatus('idle');
      } catch (err) {
        setError('Lỗi khi đọc file Excel.');
      }
    };
    reader.readAsBinaryString(file);
  };

  const speak = async (text: string, onEnd: () => void) => {
    try {
      const apiUrl = import.meta.env.VITE_CLIPROXY_API || 'https://api.thitong.site/v1';
      const apiToken = import.meta.env.VITE_CLIPROXY_TOKEN || 'sk-khanh20111989tom@';

      const response = await fetch(`${apiUrl}/audio/speech`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiToken}`
        },
        body: JSON.stringify({
          model: "tts-1",
          input: text,
          voice: selectedVoice || "alloy"
        }),
      });

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      if (!audioRef.current) {
        audioRef.current = new Audio();
      }

      audioRef.current.src = url;
      audioRef.current.playbackRate = speechRate;
      audioRef.current.onended = onEnd;
      audioRef.current.play();
    } catch (err) {
      console.error('TTS Error', err);
      onEnd();
    }
  };

  const readRow = (index: number) => {
    const currentData = dataRef.current;

    if (index >= currentData.length) {
      setStatus('idle');
      setCurrentIndex(-1);
      speak('Đã đọc xong danh sách.', () => { });
      return;
    }

    setCurrentIndex(index);
    setStatus('reading');
    setTranscript('');

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) { }
    }

    const row = currentData[index];
    const textToSpeak = `Số thứ tự ${row.stt}. Họ và tên: ${row.hoTen}. Ngày sinh: ${row.ngaySinh}.`;

    speak(textToSpeak, () => {
      setStatus('listening');
      if (recognitionRef.current) {
        try { recognitionRef.current.start(); } catch (e) { }
      }
    });
  };

  const handleStart = () => {
    if (data.length === 0) return;
    const startIndex = currentIndex >= 0 ? currentIndex : 0;
    readRow(startIndex);
  };

  const handleStop = () => {
    setStatus('idle');
    if (audioRef.current) audioRef.current.pause();
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) { }
    }
  };

  const handleNextManual = () => {
    if (status !== 'idle') {
      readRow(currentIndexRef.current + 1);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="text-emerald-600" />
              Hệ thống đọc Excel & Điều khiển giọng nói (Google Cloud TTS)
            </h1>
            <p className="text-slate-500 mt-1">
              Tải lên file Excel, hệ thống sẽ đọc từng dòng và chờ bạn nói "oke" để đọc tiếp.
            </p>
          </div>

          <div className="relative">
            <input
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="flex items-center gap-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-4 py-2 rounded-xl font-medium transition-colors cursor-pointer"
            >
              <Upload size={18} />
              Tải file Excel
            </label>
          </div>
        </header>

        {error && (
          <div className="bg-red-50 text-red-700 p-4 rounded-xl flex items-start gap-3 border border-red-100">
            <AlertCircle className="shrink-0 mt-0.5" size={20} />
            <p>{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col h-[600px]">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <div>
                <h2 className="font-semibold text-slate-800">Dữ liệu ({data.length} dòng)</h2>
                {data.length > 0 && status === 'idle' && (
                  <p className="text-xs text-slate-500 mt-1">Nhấn vào một dòng bất kỳ để chọn vị trí bắt đầu đọc.</p>
                )}
              </div>
              {data.length > 0 && (
                <span className="text-xs font-medium bg-slate-200 text-slate-700 px-2 py-1 rounded-md">
                  Đang chọn dòng: {currentIndex >= 0 ? currentIndex + 1 : 'Chưa bắt đầu'}
                </span>
              )}
            </div>

            <div className="flex-1 overflow-auto p-0">
              {data.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-3">
                  <FileSpreadsheet size={48} className="opacity-20" />
                  <p>Chưa có dữ liệu. Vui lòng tải file lên.</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="p-3 text-sm font-semibold text-slate-600 border-b border-slate-200 w-20">STT</th>
                      <th className="p-3 text-sm font-semibold text-slate-600 border-b border-slate-200">Họ và tên</th>
                      <th className="p-3 text-sm font-semibold text-slate-600 border-b border-slate-200">Ngày sinh</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row, idx) => (
                      <tr
                        key={idx}
                        onClick={() => {
                          if (status === 'idle') {
                            setCurrentIndex(idx);
                          }
                        }}
                        className={`border-b border-slate-100 transition-colors ${status === 'idle' ? 'cursor-pointer' : ''} ${idx === currentIndex
                          ? 'bg-emerald-50 border-emerald-200'
                          : 'hover:bg-slate-50'
                          }`}
                      >
                        <td className="p-3 text-sm font-medium text-slate-700">
                          {idx === currentIndex && <Volume2 size={16} className="inline mr-2 text-emerald-600 animate-pulse" />}
                          {row.stt}
                        </td>
                        <td className="p-3 text-sm text-slate-800">{row.hoTen}</td>
                        <td className="p-3 text-sm text-slate-600">{row.ngaySinh}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              <h2 className="font-semibold text-slate-800 mb-4">Điều khiển</h2>

              <div className="flex flex-col gap-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <label className="text-slate-600">Giọng đọc (OpenAI TTS)</label>
                  </div>
                  <select
                    value={selectedVoice}
                    onChange={(e) => setSelectedVoice(e.target.value)}
                    className="w-full p-2 bg-slate-100 rounded-lg text-sm text-slate-800 border-none"
                  >
                    <option value="">Chọn giọng đọc...</option>
                    {availableVoices.map((voice) => (
                      <option key={voice.name} value={voice.name}>
                        {voice.name} ({voice.ssmlGender})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <label className="text-slate-600">Tốc độ đọc</label>
                    <span className="font-medium text-slate-800">{speechRate.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={speechRate}
                    onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                  />
                </div>

                {status === 'idle' ? (
                  <button
                    onClick={handleStart}
                    disabled={data.length === 0}
                    className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white py-3 px-4 rounded-xl font-medium transition-colors w-full"
                  >
                    <Play size={20} />
                    Bắt đầu đọc
                  </button>
                ) : (
                  <button
                    onClick={handleStop}
                    className="flex items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white py-3 px-4 rounded-xl font-medium transition-colors w-full"
                  >
                    <Square size={20} />
                    Dừng lại
                  </button>
                )}

                <button
                  onClick={handleNextManual}
                  disabled={status === 'idle'}
                  className="flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 py-3 px-4 rounded-xl font-medium transition-colors w-full"
                >
                  Đọc dòng tiếp theo (Thủ công)
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              <h2 className="font-semibold text-slate-800 mb-4">Trạng thái hệ thống</h2>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${status === 'idle' ? 'bg-slate-300' :
                    status === 'reading' ? 'bg-blue-500 animate-pulse' :
                      'bg-emerald-500 animate-pulse'
                    }`} />
                  <span className="font-medium text-slate-700">
                    {status === 'idle' ? 'Đang chờ' :
                      status === 'reading' ? 'Đang đọc dữ liệu...' :
                        'Đang nghe lệnh "oke"...'}
                  </span>
                </div>

                {status === 'listening' && (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex items-start gap-3">
                    <Mic className="text-emerald-600 shrink-0 mt-0.5 animate-pulse" size={20} />
                    <div>
                      <p className="text-sm font-medium text-emerald-800">Hãy nói "Oke" hoặc "Tiếp"</p>
                      <p className="text-xs text-emerald-600 mt-1">Hệ thống đang lắng nghe qua micro của bạn.</p>
                    </div>
                  </div>
                )}

                {status === 'reading' && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start gap-3">
                    <Volume2 className="text-blue-600 shrink-0 mt-0.5 animate-pulse" size={20} />
                    <div>
                      <p className="text-sm font-medium text-blue-800">Đang phát âm thanh</p>
                      <p className="text-xs text-blue-600 mt-1">Vui lòng chờ đọc xong...</p>
                    </div>
                  </div>
                )}

                {transcript && (
                  <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <p className="text-xs text-slate-500 mb-1">Bạn vừa nói:</p>
                    <p className="text-sm font-medium text-slate-800 italic">"{transcript}"</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
