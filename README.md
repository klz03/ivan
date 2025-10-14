# Script Teleprompter & Voice Recorder

A comprehensive web application for script recording and teleprompter functionality that allows users to upload PDF scripts, record character voices, and create professional audio productions with automatic teleprompter advancement.

## Features

### 🎬 Complete Workflow
1. **PDF Script Upload** - Upload and parse PDF scripts to extract dialogue
2. **Character Management** - Select which characters to record vs. speak live
3. **Audio Recording** - Record character voices with automatic line labeling
4. **Teleprompter Interface** - Speech-recognition enabled teleprompter with auto-advance
5. **Production Mode** - Mixed recording/playback mode for final production

### 🎯 Key Capabilities
- **Smart PDF Parsing** - Automatically extracts character dialogue from scripts
- **Voice Recording** - High-quality audio recording with visual feedback
- **Speech Recognition** - Auto-advance teleprompter when speech is detected
- **Audio Management** - Organized storage by character name and line number
- **Production Mode** - Seamlessly combine recorded audio with live speaking
- **Modern UI** - Beautiful, responsive interface with smooth animations

## Getting Started

### Prerequisites
- Modern web browser with microphone access
- PDF script file with character dialogue
- HTTPS connection (required for microphone access)

### Installation
1. Clone or download this repository
2. Open `index.html` in a web browser
3. Ensure you're using HTTPS (required for microphone access)

### Usage

#### Step 1: Upload Script
1. Click "Choose File" or drag and drop your PDF script
2. Click "Process Script" to extract dialogue and characters
3. The application will automatically identify characters and their dialogue

#### Step 2: Character Setup
1. **Record Characters**: Select characters you want to pre-record with voice effects
2. **Speak Live**: Select characters you want to speak in real-time during production
3. Click "Start Recording Session" when ready

#### Step 3: Record Character Voices
1. The application will cycle through each character you selected to record
2. For each character:
   - Read the current line displayed in the teleprompter
   - Click "Start Recording" or use speech recognition (say "done" when finished)
   - Use "Skip Line" to skip lines you don't want to record
   - Navigate with Previous/Next buttons as needed

#### Step 4: Production Mode
1. Select your production preferences:
   - ✅ Play Recorded Audio (for pre-recorded characters)
   - ✅ Live Speaking (for real-time characters)
2. Click "Start Production"
3. The teleprompter will automatically:
   - Play recorded audio for characters you recorded
   - Wait for your live speech for characters you're speaking
   - Skip lines for characters not selected
   - Advance automatically based on speech recognition

## Technical Features

### PDF Processing
- Uses PDF.js library for client-side PDF parsing
- Automatically detects character names (CAPS or Title Case followed by colon)
- Extracts and numbers dialogue lines in speaking order
- Filters out non-dialogue content

### Audio Recording
- High-quality audio recording using Web Audio API
- Real-time audio visualization during recording
- Automatic file naming: `{character}_{lineNumber}.wav`
- In-memory storage for quick access during production

### Speech Recognition
- Built-in speech recognition for hands-free operation
- Auto-advance when "done", "finished", or "complete" is detected
- Works during both recording and production modes
- Fallback to manual controls if speech recognition fails

### Production Mode
- Seamless mixing of recorded audio and live speech
- Automatic line progression based on content type
- Real-time status updates and progress tracking
- Pause/Resume functionality for production control

## Browser Compatibility

- **Chrome/Edge**: Full support (recommended)
- **Firefox**: Full support
- **Safari**: Full support (may require user permission prompts)
- **Mobile Browsers**: Supported with touch-friendly interface

## File Structure

```
ivan/
├── index.html          # Main application interface
├── styles.css          # Styling and responsive design
├── script.js           # Core application logic
└── README.md           # This documentation
```

## Security & Privacy

- All processing happens client-side (no server required)
- Audio recordings are stored locally in browser memory
- No data is sent to external servers
- Microphone access is only used when actively recording

## Troubleshooting

### Microphone Issues
- Ensure browser has microphone permissions
- Use HTTPS connection (required for microphone access)
- Check browser console for error messages

### PDF Processing Issues
- Ensure PDF contains text (not scanned images)
- Character names should be in CAPS or Title Case followed by colon
- Try different PDF formats if parsing fails

### Speech Recognition Issues
- Speak clearly and at normal volume
- Use trigger words: "done", "finished", "complete"
- Manual controls are always available as fallback

## Future Enhancements

- Voice changer effects for recorded audio
- Export functionality for recorded audio files
- Multiple script format support (DOCX, TXT)
- Cloud storage integration
- Collaborative recording features
- Advanced audio editing capabilities

## License

This project is open source and available under the MIT License.

## Support

For issues or feature requests, please check the browser console for error messages and ensure you're using a compatible browser with microphone permissions enabled.
