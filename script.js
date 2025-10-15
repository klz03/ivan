// Global state management
class AppState {
    constructor() {
        this.scriptText = '';
        this.dialogueLines = [];
        this.characters = new Set();
        this.recordCharacters = new Set();
        this.speakCharacters = new Set();
        this.audioRecordings = new Map(); // character -> Map(lineNumber -> audioBlob)
        this.currentCharacter = null;
        this.currentLineIndex = 0;
        this.isRecording = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.recognition = null;
        this.isProductionMode = false;
        this.productionLineIndex = 0;
        this.speechTimeout = null;
        this.audioContext = null;
        this.audioProcessor = null;
    }

    reset() {
        this.scriptText = '';
        this.dialogueLines = [];
        this.characters.clear();
        this.recordCharacters.clear();
        this.speakCharacters.clear();
        this.audioRecordings.clear();
        this.currentCharacter = null;
        this.currentLineIndex = 0;
        this.isRecording = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isProductionMode = false;
        this.productionLineIndex = 0;
    }
}

const appState = new AppState();

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    setupEventListeners();
    setupSpeechRecognition();
    setupAudioVisualizer();
}

function setupEventListeners() {
    // Script Upload
    const scriptInput = document.getElementById('scriptInput');
    const uploadArea = document.getElementById('uploadArea');
    const processScriptBtn = document.getElementById('processScriptBtn');

    scriptInput.addEventListener('change', handleScriptUpload);
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleFileDrop);
    processScriptBtn.addEventListener('click', processScript);

    // Character Selection
    document.getElementById('startRecordingBtn').addEventListener('click', startRecordingSession);

    // Recording Controls
    document.getElementById('recordBtn').addEventListener('click', startRecording);
    document.getElementById('stopBtn').addEventListener('click', stopRecording);
    document.getElementById('rerecordBtn').addEventListener('click', rerecordLine);
    document.getElementById('skipBtn').addEventListener('click', skipLine);
    document.getElementById('prevLineBtn').addEventListener('click', previousLine);
    document.getElementById('nextLineBtn').addEventListener('click', nextLine);
    document.getElementById('finishRecordingBtn').addEventListener('click', finishRecordingSession);

    // Production Controls
    document.getElementById('startProductionBtn').addEventListener('click', startProduction);
    document.getElementById('pauseProductionBtn').addEventListener('click', pauseProduction);
    document.getElementById('stopProductionBtn').addEventListener('click', stopProduction);
}

function setupSpeechRecognition() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        appState.recognition = new SpeechRecognition();
        appState.recognition.continuous = false;
        appState.recognition.interimResults = false;
        appState.recognition.lang = 'en-US';

        appState.recognition.onresult = function(event) {
            const result = event.results[0][0].transcript.toLowerCase();
            console.log('Speech recognition result:', result);
            
            // Clear any existing speech timeout since we detected speech
            if (appState.speechTimeout) {
                clearTimeout(appState.speechTimeout);
                appState.speechTimeout = null;
            }
            
            // Check for completion words
            const completionWords = ['done', 'finished', 'complete', 'next', 'advance', 'continue'];
            const hasCompletionWord = completionWords.some(word => result.includes(word));
            
            if (appState.isRecording && hasCompletionWord) {
                stopRecording();
            } else if (appState.isProductionMode && hasCompletionWord) {
                console.log('Speech recognition detected completion, advancing line');
                advanceProductionLine();
            } else if (appState.isProductionMode) {
                // Check if the speech contains the actual dialogue line (auto-advance after speaking)
                const currentLine = appState.dialogueLines[appState.productionLineIndex];
                if (currentLine && appState.speakCharacters.has(currentLine.character)) {
                    console.log('Checking if speech matches dialogue for auto-advance');
                    // Simple check: if speech contains key words from the dialogue
                    const dialogueWords = currentLine.dialogue.toLowerCase().split(' ').filter(word => word.length > 3);
                    const spokenWords = result.split(' ').filter(word => word.length > 3);
                    const matchingWords = spokenWords.filter(word => dialogueWords.includes(word));
                    
                    // For very short dialogue (like "What?", "Yes", "No"), be more lenient
                    const isVeryShortDialogue = currentLine.dialogue.split(' ').length <= 2;
                    const isVeryShortSpeech = spokenWords.length <= 2;
                    
                    // If we have at least 2 matching significant words, auto-advance
                    // Or if it's a short response with at least 1 match
                    // Or if it's a very short dialogue and we have any speech at all
                    if (matchingWords.length >= 2 || 
                        (matchingWords.length >= 1 && spokenWords.length <= 3) ||
                        (isVeryShortDialogue && result.trim().length > 0)) {
                        console.log('Auto-advancing based on dialogue match', matchingWords, 'Short dialogue:', isVeryShortDialogue);
                        setTimeout(() => advanceProductionLine(), 1000); // Small delay to ensure speech is complete
                    } else {
                        console.log('Not enough matching words to auto-advance. Matching:', matchingWords, 'Spoken:', spokenWords, 'Dialogue:', currentLine.dialogue);
                    }
                }
            }
        };
        
        appState.recognition.onend = function() {
            console.log('Speech recognition ended');
            // Restart recognition if we're in production mode and waiting for live speech
            if (appState.isProductionMode && appState.speakCharacters.has(appState.dialogueLines[appState.productionLineIndex]?.character)) {
                // Set a timeout to auto-advance if no speech is detected for 30 seconds
                if (appState.speechTimeout) {
                    clearTimeout(appState.speechTimeout);
                }
                appState.speechTimeout = setTimeout(() => {
                    if (appState.isProductionMode && appState.speakCharacters.has(appState.dialogueLines[appState.productionLineIndex]?.character)) {
                        console.log('Auto-advancing due to speech timeout (30 seconds)');
                        advanceProductionLine();
                    }
                }, 30000);
                
                setTimeout(() => {
                    if (appState.isProductionMode && appState.recognition.state !== 'started') {
                        console.log('Restarting speech recognition for production mode');
                        try {
                            appState.recognition.start();
                        } catch (error) {
                            console.log('Speech recognition already started, skipping restart');
                        }
                    }
                }, 100);
            }
        };

        appState.recognition.onerror = function(event) {
            console.error('Speech recognition error:', event.error);
        };
    }
}

function setupAudioVisualizer() {
    const canvas = document.getElementById('visualizerCanvas');
    const ctx = canvas.getContext('2d');
    
    function drawVisualizer() {
        if (appState.isRecording) {
            requestAnimationFrame(drawVisualizer);
            
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#667eea';
            
            for (let i = 0; i < 50; i++) {
                const height = Math.random() * canvas.height * 0.8;
                ctx.fillRect(i * 4, canvas.height - height, 2, height);
            }
        }
    }
    
    // Start visualizer when recording starts
    const originalStartRecording = startRecording;
    startRecording = function() {
        originalStartRecording();
        if (appState.isRecording) {
            document.getElementById('audioVisualizer').classList.add('active');
            drawVisualizer();
        }
    };
    
    const originalStopRecording = stopRecording;
    stopRecording = function() {
        originalStopRecording();
        document.getElementById('audioVisualizer').classList.remove('active');
    };
}

// Script Upload Functions
function handleDragOver(e) {
    e.preventDefault();
    e.currentTarget.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
}

function handleFileDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0 && isSupportedFile(files[0])) {
        handleScriptFile(files[0]);
    } else {
        showStatusMessage('Please upload a .txt or .fountain file', 'error');
    }
}

function handleScriptUpload(e) {
    const file = e.target.files[0];
    if (file && isSupportedFile(file)) {
        handleScriptFile(file);
    } else {
        showStatusMessage('Please select a .txt or .fountain file', 'error');
    }
}

function isSupportedFile(file) {
    const supportedTypes = ['.txt', '.fountain'];
    const fileName = file.name.toLowerCase();
    return supportedTypes.some(type => fileName.endsWith(type));
}

function handleScriptFile(file) {
    document.getElementById('scriptFileName').textContent = file.name;
    document.getElementById('scriptInfo').classList.remove('hidden');
    showStatusMessage('Script uploaded successfully', 'success');
}

async function processScript() {
    const fileInput = document.getElementById('scriptInput');
    const file = fileInput.files[0];
    
    if (!file) {
        showStatusMessage('Please upload a script file first', 'error');
        return;
    }

    try {
        showStatusMessage('Processing script...', 'info');
        
        // Read the file as text
        const text = await file.text();
        appState.scriptText = text;
        
        console.log('Processing script file:', file.name);
        console.log('File type:', file.name.toLowerCase().endsWith('.fountain') ? 'Fountain' : 'Text');
        console.log('First 500 characters:', text.substring(0, 500));
        
        const processedData = parseDialogue(text, file.name);
        
        appState.dialogueLines = processedData.lines;
        appState.characters = processedData.characters;
        
        console.log('Parsed', appState.dialogueLines.length, 'dialogue lines');
        console.log('Found characters:', Array.from(appState.characters));
        
        showCharacterSelection();
        showStatusMessage('Script processed successfully', 'success');
        
    } catch (error) {
        console.error('Error processing script:', error);
        showStatusMessage('Error processing script', 'error');
    }
}

function parseDialogue(text, fileName) {
    const lines = [];
    const characters = new Set();
    
    // Split text into lines
    const textLines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    console.log('Found', textLines.length, 'text lines');
    
    let lineNumber = 1;
    const isFountain = fileName.toLowerCase().endsWith('.fountain');
    
    // Handle screenplay format where character names are on separate lines
    let currentCharacter = '';
    
    for (let i = 0; i < textLines.length; i++) {
        const line = textLines[i];
        
        // Skip scene headings, action lines, and other non-dialogue elements
        if (isSceneHeading(line) || isActionLine(line) || isCharacterDescription(line)) {
            currentCharacter = '';
            continue;
        }
        
        // Check if this line is a character name (standalone, typically in ALL CAPS)
        if (isCharacterName(line)) {
            currentCharacter = line.trim();
            console.log('Found character name:', currentCharacter);
            continue;
        }
        
        // If we have a character and this line looks like dialogue
        if (currentCharacter && isDialogue(line)) {
            console.log('Found character:', currentCharacter, 'with dialogue:', line.substring(0, 50) + '...');
            
            characters.add(currentCharacter);
            lines.push({
                number: lineNumber++,
                character: currentCharacter,
                dialogue: line
            });
        }
    }
    
    console.log('Parsed', lines.length, 'dialogue lines from', characters.size, 'characters');
    console.log('Characters found:', Array.from(characters));
    
    return { lines, characters };
}

function isSceneHeading(line) {
    // Scene headings start with INT. or EXT.
    return /^(INT\.|EXT\.)/.test(line);
}

function isActionLine(line) {
    // Action lines are typically descriptive text in sentence case
    // They often contain words like "sits", "approaches", "looks", etc.
    const actionWords = ['sits', 'stands', 'walks', 'approaches', 'looks', 'turns', 'takes', 'places', 'rushes', 'enjoy', 'typing', 'laptop'];
    
    // Check if it contains action words
    const hasActionWords = actionWords.some(word => line.toLowerCase().includes(word));
    
    // Check if it's NOT a character name (avoid recursive call)
    const isNotCharacterName = !isCharacterNameDirect(line);
    
    return hasActionWords && isNotCharacterName;
}

function isCharacterDescription(line) {
    // Character descriptions like "SARAH, 28, sits at a table"
    return /^[A-Z]+,\s*\d+/.test(line) || /^[A-Z]+\s+\(/.test(line);
}

function isCharacterNameDirect(line) {
    // Direct character name check without recursive calls
    // Check if it's ALL CAPS and reasonable length for a character name
    const words = line.split(' ');
    if (words.length >= 1 && words.length <= 4) {
        // All words should be ALL CAPS and not too long
        const allCaps = words.every(word => /^[A-Z]+$/.test(word) && word.length > 1 && word.length <= 15);
        
        // Additional check: not common action words
        const actionWords = ['THE', 'AND', 'OR', 'BUT', 'WITH', 'FROM', 'INTO', 'UPON', 'UNDER', 'OVER'];
        const notActionWord = !words.some(word => actionWords.includes(word));
        
        return allCaps && notActionWord;
    }
    
    return false;
}

function isCharacterName(line) {
    // Character names are typically:
    // 1. ALL CAPS words (2-4 words max)
    // 2. Not followed by a colon (that's handled elsewhere)
    // 3. Not scene headings
    // 4. Not action descriptions
    
    if (isSceneHeading(line) || isCharacterDescription(line)) {
        return false;
    }
    
    // Use direct check to avoid recursion
    return isCharacterNameDirect(line);
}

function isDialogue(line) {
    // Dialogue is typically:
    // 1. Not ALL CAPS (unless it's shouting)
    // 2. Contains normal sentence structure
    // 3. Not scene headings or action lines
    // 4. Not stage directions
    
    if (isSceneHeading(line) || isCharacterDescription(line) || isCharacterNameDirect(line)) {
        return false;
    }
    
    // Filter out stage directions and action descriptions
    const stageDirectionWords = ['considers', 'eyes', 'light', 'up', 'places', 'sits', 'approaches', 'looks', 'turns', 'takes', 'rushes', 'enjoy', 'typing', 'laptop', 'fade', 'end', 'continues', 'moves', 'walks', 'stands', 'enters', 'exits'];
    const isStageDirection = stageDirectionWords.some(word => line.toLowerCase().includes(word)) && 
                           (line.includes('s') && line.toLowerCase().includes('s')) || // Contains 's for possessive
                           line.toLowerCase().includes('this') ||
                           line.toLowerCase().includes('moment') ||
                           line.toLowerCase().includes('eyes') ||
                           line.toLowerCase().includes('light');
    
    if (isStageDirection) {
        return false;
    }
    
    // Filter out ALL CAPS lines that are likely stage directions
    if (/^[A-Z\s]+$/.test(line) && line.length > 3) {
        return false;
    }
    
    // Check if it looks like dialogue (mixed case, contains common dialogue words)
    const dialogueWords = ['I', 'you', 'the', 'a', 'an', 'and', 'or', 'but', 'thanks', 'hey', 'hello', 'yes', 'no', 'well', 'okay', 'sure', 'really', 'what', 'how', 'why', 'when', 'where'];
    const hasDialogueWords = dialogueWords.some(word => line.toLowerCase().includes(word.toLowerCase()));
    
    // Not ALL CAPS (unless it's short and might be shouting)
    const notAllCaps = !/^[A-Z\s]+$/.test(line) || line.length < 10;
    
    // Must contain common dialogue patterns
    const hasDialoguePatterns = line.includes('?') || line.includes('!') || line.includes('.') || 
                               line.toLowerCase().includes('i ') || line.toLowerCase().includes('you ') ||
                               line.toLowerCase().includes('the ') || line.toLowerCase().includes('a ') ||
                               line.toLowerCase().includes('an ') || line.toLowerCase().includes('and ');
    
    return hasDialogueWords && notAllCaps && hasDialoguePatterns && line.length > 0;
}

function parseFountainLine(line) {
    // Fountain format: Character names are typically in ALL CAPS and not indented
    // Dialogue follows immediately after the character name
    
    // Pattern 1: Character name in ALL CAPS (not indented)
    if (!line.startsWith(' ') && !line.startsWith('\t')) {
        // Check if this looks like a character name (ALL CAPS, reasonable length)
        const words = line.split(' ');
        if (words.length <= 4 && words.every(word => /^[A-Z]+$/.test(word) && word.length > 1)) {
            // This could be a character name, but we need to check the next line for dialogue
            return { character: '', dialogue: '' };
        }
    }
    
    // Pattern 2: Look for dialogue markers
    const dialogueMatch = line.match(/^([A-Z][A-Z\s]+)\s*:\s*(.+)/);
    if (dialogueMatch) {
        return {
            character: dialogueMatch[1].trim(),
            dialogue: dialogueMatch[2].trim()
        };
    }
    
    return { character: '', dialogue: '' };
}

function parseTextLine(line) {
    // Plain text format: Look for various dialogue patterns
    
    // Pattern 1: Character: Dialogue
    let match = line.match(/^([A-Z][A-Z\s]+)\s*:\s*(.+)/);
    if (match) {
        return {
            character: match[1].trim(),
            dialogue: match[2].trim()
        };
    }
    
    // Pattern 2: Character Name: Dialogue (Title Case)
    match = line.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*:\s*(.+)/);
    if (match) {
        return {
            character: match[1].trim(),
            dialogue: match[2].trim()
        };
    }
    
    // Pattern 3: (Character) Dialogue
    match = line.match(/^\(([A-Za-z\s]+)\)\s*(.+)/);
    if (match) {
        return {
            character: match[1].trim(),
            dialogue: match[2].trim()
        };
    }
    
    // Pattern 4: CHARACTER - Dialogue
    match = line.match(/^([A-Z][A-Z\s]+)\s*-\s*(.+)/);
    if (match) {
        return {
            character: match[1].trim(),
            dialogue: match[2].trim()
        };
    }
    
    // Pattern 5: Any capitalized word followed by colon
    match = line.match(/^([A-Z][A-Za-z\s]+?)\s*:\s*(.+)/);
    if (match) {
        const character = match[1].trim();
        const dialogue = match[2].trim();
        
        // Make sure it's not too long to be a character name (more than 3 words)
        if (character.split(' ').length <= 3) {
            return { character, dialogue };
        }
    }
    
    return { character: '', dialogue: '' };
}

// Character Selection Functions
function showCharacterSelection() {
    console.log('Showing character selection for', appState.characters.size, 'characters');
    console.log('Characters:', Array.from(appState.characters));
    
    const recordContainer = document.getElementById('recordCharacters');
    const speakContainer = document.getElementById('speakCharacters');
    
    recordContainer.innerHTML = '';
    speakContainer.innerHTML = '';
    
    if (appState.characters.size === 0) {
        recordContainer.innerHTML = '<p style="color: #666; font-style: italic;">No characters found. Make sure your script has dialogue in one of these formats:<br>• "CHARACTER: dialogue"<br>• "Character Name: dialogue"<br>• "(Character) dialogue"<br>• "CHARACTER - dialogue"</p>';
        speakContainer.innerHTML = '<p style="color: #666; font-style: italic;">No characters found. Make sure your script has dialogue in one of these formats:<br>• "CHARACTER: dialogue"<br>• "Character Name: dialogue"<br>• "(Character) dialogue"<br>• "CHARACTER - dialogue"</p>';
    } else {
        appState.characters.forEach(character => {
            // Record characters
            const recordItem = createCharacterItem(character, 'record');
            recordContainer.appendChild(recordItem);
            
            // Speak characters
            const speakItem = createCharacterItem(character, 'speak');
            speakContainer.appendChild(speakItem);
        });
    }
    
    showSection('character-section');
}

function createCharacterItem(character, type) {
    const item = document.createElement('div');
    item.className = 'character-item';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `${type}-${character}`;
    checkbox.addEventListener('change', handleCharacterSelection);
    
    const label = document.createElement('label');
    label.htmlFor = checkbox.id;
    label.textContent = character;
    
    item.appendChild(checkbox);
    item.appendChild(label);
    
    return item;
}

function handleCharacterSelection(e) {
    const checkbox = e.target;
    const character = checkbox.id.split('-').slice(1).join('-');
    const type = checkbox.id.split('-')[0];
    
    if (type === 'record') {
        if (checkbox.checked) {
            appState.recordCharacters.add(character);
            appState.audioRecordings.set(character, new Map());
        } else {
            appState.recordCharacters.delete(character);
            appState.audioRecordings.delete(character);
        }
    } else if (type === 'speak') {
        if (checkbox.checked) {
            appState.speakCharacters.add(character);
        } else {
            appState.speakCharacters.delete(character);
        }
    }
    
    // Update character item styling
    const characterItem = checkbox.closest('.character-item');
    if (checkbox.checked) {
        characterItem.classList.add('selected');
    } else {
        characterItem.classList.remove('selected');
    }
    
    // Enable/disable start recording button
    const startBtn = document.getElementById('startRecordingBtn');
    startBtn.disabled = appState.recordCharacters.size === 0;
}

// Recording Functions
function startRecordingSession() {
    if (appState.recordCharacters.size === 0) {
        showStatusMessage('Please select at least one character to record', 'error');
        return;
    }
    
    appState.currentCharacter = Array.from(appState.recordCharacters)[0];
    appState.currentLineIndex = 0;
    
    updateRecordingInterface();
    showSection('recording-section');
}

function updateRecordingInterface() {
    document.getElementById('currentCharacterName').textContent = appState.currentCharacter;
    
    const characterLines = appState.dialogueLines.filter(line => 
        line.character === appState.currentCharacter
    );
    
    if (characterLines.length === 0) {
        showStatusMessage('No dialogue found for this character', 'info');
        return;
    }
    
    const currentLine = characterLines[appState.currentLineIndex];
    
    document.getElementById('currentLineNumber').textContent = currentLine.number;
    document.getElementById('teleprompterText').textContent = currentLine.dialogue;
    
    // Check if this line has been recorded
    const hasRecording = appState.audioRecordings.get(appState.currentCharacter)?.has(currentLine.number);
    const rerecordBtn = document.getElementById('rerecordBtn');
    
    if (hasRecording) {
        rerecordBtn.textContent = '🔄 Rerecord Line';
        rerecordBtn.style.background = 'linear-gradient(135deg, #4299e1, #3182ce)';
        document.getElementById('teleprompterText').style.border = '2px solid #38b2ac';
        document.getElementById('teleprompterText').style.backgroundColor = '#f0f9ff';
    } else {
        rerecordBtn.textContent = '📝 Record Line';
        rerecordBtn.style.background = 'linear-gradient(135deg, #718096, #4a5568)';
        document.getElementById('teleprompterText').style.border = '2px solid #e2e8f0';
        document.getElementById('teleprompterText').style.backgroundColor = '#1a202c';
    }
    
    // Update progress
    const progress = ((appState.currentLineIndex + 1) / characterLines.length) * 100;
    document.getElementById('progressFill').style.width = `${progress}%`;
    
    // Update button states
    document.getElementById('prevLineBtn').disabled = appState.currentLineIndex === 0;
    document.getElementById('nextLineBtn').disabled = appState.currentLineIndex === characterLines.length - 1;
}

async function startRecording() {
    try {
        let stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Get selected voice effect
        const selectedEffect = document.querySelector('input[name="voiceEffect"]:checked').value;
        
        // Apply voice effects if not "none"
        if (selectedEffect !== 'none') {
            stream = await applyVoiceEffect(stream, selectedEffect);
        }
        
        appState.mediaRecorder = new MediaRecorder(stream);
        appState.audioChunks = [];
        
        appState.mediaRecorder.ondataavailable = function(event) {
            appState.audioChunks.push(event.data);
        };
        
        appState.mediaRecorder.onstop = async function() {
            const audioBlob = new Blob(appState.audioChunks, { type: 'audio/wav' });
            const characterLines = appState.dialogueLines.filter(line => 
                line.character === appState.currentCharacter
            );
            const currentLine = characterLines[appState.currentLineIndex];
            
            // Apply post-processing effects to the recorded audio
            let processedAudioBlob = audioBlob;
            if (selectedEffect !== 'none') {
                try {
                    console.log('Attempting to apply voice effect:', selectedEffect);
                    processedAudioBlob = await applyPostProcessingEffects(audioBlob, selectedEffect);
                    console.log('Voice effect applied successfully');
                } catch (error) {
                    console.error('Error applying post-processing effects:', error);
                    console.log('Falling back to original audio');
                    // Fall back to original audio if processing fails
                    processedAudioBlob = audioBlob;
                }
            }
            
            // Store with the actual line number from the dialogue array
            appState.audioRecordings.get(appState.currentCharacter).set(currentLine.number, processedAudioBlob);
            
            console.log('Saved recording for', appState.currentCharacter, 'line', currentLine.number, 'with effect:', selectedEffect);
            console.log('Available recordings for', appState.currentCharacter, ':', 
                Array.from(appState.audioRecordings.get(appState.currentCharacter).keys()));
            
            // Stop all tracks
            stream.getTracks().forEach(track => track.stop());
            
            // Clean up audio context if it was created
            if (appState.audioContext && appState.audioContext.state !== 'closed') {
                appState.audioContext.close();
            }
        };
        
        appState.mediaRecorder.start();
        appState.isRecording = true;
        
        document.getElementById('recordBtn').disabled = true;
        document.getElementById('stopBtn').disabled = false;
        
        // Start speech recognition for auto-advance
        if (appState.recognition) {
            appState.recognition.start();
        }
        
        showStatusMessage(`Recording with ${getEffectName(selectedEffect)} effect... Say "done" when finished`, 'info');
        
    } catch (error) {
        console.error('Error accessing microphone:', error);
        showStatusMessage('Error accessing microphone', 'error');
    }
}

async function applyVoiceEffect(stream, effect) {
    try {
        appState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = appState.audioContext.createMediaStreamSource(stream);
        const destination = appState.audioContext.createMediaStreamDestination();
        
        // Create the effect processor based on the selected effect
        const processor = createVoiceEffectProcessor(appState.audioContext, effect);
        
        // Connect the audio nodes
        source.connect(processor);
        processor.connect(destination);
        
        return destination.stream;
    } catch (error) {
        console.error('Error applying voice effect:', error);
        return stream; // Return original stream if effect fails
    }
}

function createVoiceEffectProcessor(audioContext, effect) {
    if (effect === 'none') {
        // For no effect, just create a simple gain node
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 1.0;
        return gainNode;
    }
    
    // Create a pitch shifter using a combination of nodes
    const inputGain = audioContext.createGain();
    const outputGain = audioContext.createGain();
    
    // Create a buffer source for pitch shifting
    const bufferSource = audioContext.createBufferSource();
    const analyser = audioContext.createAnalyser();
    const convolver = audioContext.createConvolver();
    
    // Connect the audio chain
    inputGain.connect(analyser);
    analyser.connect(outputGain);
    
    // Apply effect-specific pitch and tone modifications
    switch (effect) {
        case 'male':
            // Lower pitch, deeper tone
            inputGain.gain.value = 1.1;
            outputGain.gain.value = 0.9;
            // Create a low-pass filter for deeper sound
            const maleFilter = audioContext.createBiquadFilter();
            maleFilter.type = 'lowpass';
            maleFilter.frequency.value = 3000;
            maleFilter.Q.value = 1;
            analyser.connect(maleFilter);
            maleFilter.connect(outputGain);
            break;
            
        case 'female':
            // Higher pitch, brighter tone
            inputGain.gain.value = 1.05;
            outputGain.gain.value = 1.0;
            // Create a high-pass filter for brighter sound
            const femaleFilter = audioContext.createBiquadFilter();
            femaleFilter.type = 'highpass';
            femaleFilter.frequency.value = 200;
            femaleFilter.Q.value = 1;
            analyser.connect(femaleFilter);
            femaleFilter.connect(outputGain);
            break;
            
        case 'elderly-male':
            // Lower pitch with tremolo effect
            inputGain.gain.value = 1.2;
            outputGain.gain.value = 0.8;
            // Add tremolo using LFO
            const elderlyTremolo = audioContext.createGain();
            const elderlyLFO = audioContext.createOscillator();
            const elderlyLFOGain = audioContext.createGain();
            
            elderlyLFO.frequency.value = 6; // 6 Hz tremolo
            elderlyLFO.type = 'sine';
            elderlyLFOGain.gain.value = 0.1; // 10% tremolo depth
            
            elderlyLFO.connect(elderlyLFOGain);
            elderlyLFOGain.connect(elderlyTremolo.gain);
            elderlyTremolo.gain.value = 1.0;
            
            analyser.connect(elderlyTremolo);
            elderlyTremolo.connect(outputGain);
            
            elderlyLFO.start();
            break;
            
        case 'elderly-female':
            // Slightly lower pitch with warmth
            inputGain.gain.value = 1.15;
            outputGain.gain.value = 0.9;
            // Add subtle tremolo
            const elderlyFemaleTremolo = audioContext.createGain();
            const elderlyFemaleLFO = audioContext.createOscillator();
            const elderlyFemaleLFOGain = audioContext.createGain();
            
            elderlyFemaleLFO.frequency.value = 5;
            elderlyFemaleLFO.type = 'sine';
            elderlyFemaleLFOGain.gain.value = 0.08;
            
            elderlyFemaleLFO.connect(elderlyFemaleLFOGain);
            elderlyFemaleLFOGain.connect(elderlyFemaleTremolo.gain);
            elderlyFemaleTremolo.gain.value = 1.0;
            
            analyser.connect(elderlyFemaleTremolo);
            elderlyFemaleTremolo.connect(outputGain);
            
            elderlyFemaleLFO.start();
            break;
            
        case 'male-child':
            // Higher pitch but still masculine
            inputGain.gain.value = 1.15;
            outputGain.gain.value = 1.1;
            // Bright filter for child-like quality
            const maleChildFilter = audioContext.createBiquadFilter();
            maleChildFilter.type = 'peaking';
            maleChildFilter.frequency.value = 3000;
            maleChildFilter.Q.value = 2;
            maleChildFilter.gain.value = 6; // Boost high frequencies
            analyser.connect(maleChildFilter);
            maleChildFilter.connect(outputGain);
            break;
            
        case 'female-child':
            // Higher pitch, bright and energetic
            inputGain.gain.value = 1.2;
            outputGain.gain.value = 1.15;
            // Very bright filter for young female voice
            const femaleChildFilter = audioContext.createBiquadFilter();
            femaleChildFilter.type = 'peaking';
            femaleChildFilter.frequency.value = 4000;
            femaleChildFilter.Q.value = 3;
            femaleChildFilter.gain.value = 8; // Strong high frequency boost
            analyser.connect(femaleChildFilter);
            femaleChildFilter.connect(outputGain);
            break;
    }
    
    // Return the input gain node as the main processor
    return inputGain;
}

// Post-processing function to apply voice effects to recorded audio
async function applyPostProcessingEffects(audioBlob, effect) {
    return new Promise(async (resolve, reject) => {
        try {
            console.log('Starting post-processing for effect:', effect);
            console.log('Original blob size:', audioBlob.size, 'bytes');
            console.log('Original blob type:', audioBlob.type);
            
            if (audioBlob.size === 0) {
                throw new Error('Audio blob is empty');
            }
            
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const arrayBuffer = await audioBlob.arrayBuffer();
            console.log('ArrayBuffer size:', arrayBuffer.byteLength, 'bytes');
            
            if (arrayBuffer.byteLength === 0) {
                throw new Error('ArrayBuffer is empty');
            }
            
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            console.log('AudioBuffer:', {
                length: audioBuffer.length,
                duration: audioBuffer.duration,
                sampleRate: audioBuffer.sampleRate,
                numberOfChannels: audioBuffer.numberOfChannels
            });
            
            // Create offline audio context for processing
            const offlineContext = new OfflineAudioContext(
                audioBuffer.numberOfChannels,
                audioBuffer.length,
                audioBuffer.sampleRate
            );
            
            // Create source from the original audio
            const source = offlineContext.createBufferSource();
            source.buffer = audioBuffer;
            
            // Apply effects based on the selected voice type
            let processor = createPostProcessingEffect(offlineContext, effect);
            console.log('Created processor for effect:', effect);
            
            // Connect the audio graph
            source.connect(processor);
            processor.connect(offlineContext.destination);
            
            // Start processing
            source.start(0);
            
            // Render the processed audio
            console.log('Starting offline rendering...');
            const processedBuffer = await offlineContext.startRendering();
            console.log('Offline rendering complete. Processed buffer:', {
                length: processedBuffer.length,
                duration: processedBuffer.duration,
                sampleRate: processedBuffer.sampleRate,
                numberOfChannels: processedBuffer.numberOfChannels
            });
            
            // Convert back to blob
            const processedBlob = await audioBufferToBlob(processedBuffer);
            console.log('Processed blob size:', processedBlob.size, 'bytes');
            
            // Clean up
            audioContext.close();
            // Note: OfflineAudioContext doesn't have a close() method
            
            resolve(processedBlob);
            
        } catch (error) {
            console.error('Error in post-processing:', error);
            console.error('Error stack:', error.stack);
            reject(error);
        }
    });
}

function createPostProcessingEffect(audioContext, effect) {
    // Create a chain of audio nodes for the effect
    const inputGain = audioContext.createGain();
    const outputGain = audioContext.createGain();
    
    // Connect input to output by default
    inputGain.connect(outputGain);
    
    switch (effect) {
        case 'male':
            // Advanced male voice with multiple processing stages
            const maleHighPass = audioContext.createBiquadFilter();
            maleHighPass.type = 'highpass';
            maleHighPass.frequency.value = 50;
            maleHighPass.Q.value = 1;
            
            const maleLowPass = audioContext.createBiquadFilter();
            maleLowPass.type = 'lowpass';
            maleLowPass.frequency.value = 800; // Very low for deep voice
            maleLowPass.Q.value = 4;
            
            const maleFormant = audioContext.createBiquadFilter();
            maleFormant.type = 'peaking';
            maleFormant.frequency.value = 300; // Male formant frequency
            maleFormant.Q.value = 3;
            maleFormant.gain.value = 15; // Strong formant boost
            
            const maleCompressor = audioContext.createDynamicsCompressor();
            maleCompressor.threshold.value = -20;
            maleCompressor.knee.value = 40;
            maleCompressor.ratio.value = 20;
            maleCompressor.attack.value = 0.001;
            maleCompressor.release.value = 0.1;
            
            inputGain.disconnect();
            inputGain.connect(maleHighPass);
            maleHighPass.connect(maleLowPass);
            maleLowPass.connect(maleFormant);
            maleFormant.connect(maleCompressor);
            maleCompressor.connect(outputGain);
            
            inputGain.gain.value = 3.0;
            outputGain.gain.value = 0.3;
            break;
            
        case 'female':
            // Higher pitch simulation with dramatic high-pass filter
            const femaleFilter = audioContext.createBiquadFilter();
            femaleFilter.type = 'highpass';
            femaleFilter.frequency.value = 500; // Much higher for brighter female voice
            femaleFilter.Q.value = 2;
            
            const femaleBoost = audioContext.createBiquadFilter();
            femaleBoost.type = 'peaking';
            femaleBoost.frequency.value = 3000;
            femaleBoost.Q.value = 2;
            femaleBoost.gain.value = 6; // Boost high frequencies
            
            inputGain.disconnect();
            inputGain.connect(femaleFilter);
            femaleFilter.connect(femaleBoost);
            femaleBoost.connect(outputGain);
            
            inputGain.gain.value = 1.3;
            outputGain.gain.value = 1.1;
            break;
            
        case 'elderly-male':
            // Advanced elderly male voice with tremolo and formant shifting
            const elderlyHighPass = audioContext.createBiquadFilter();
            elderlyHighPass.type = 'highpass';
            elderlyHighPass.frequency.value = 70;
            elderlyHighPass.Q.value = 1;
            
            const elderlyLowPass = audioContext.createBiquadFilter();
            elderlyLowPass.type = 'lowpass';
            elderlyLowPass.frequency.value = 1200; // Aged voice cutoff
            elderlyLowPass.Q.value = 3;
            
            const elderlyFormant1 = audioContext.createBiquadFilter();
            elderlyFormant1.type = 'peaking';
            elderlyFormant1.frequency.value = 400; // Lower formant
            elderlyFormant1.Q.value = 4;
            elderlyFormant1.gain.value = 12;
            
            const elderlyFormant2 = audioContext.createBiquadFilter();
            elderlyFormant2.type = 'peaking';
            elderlyFormant2.frequency.value = 800; // Second formant
            elderlyFormant2.Q.value = 2;
            elderlyFormant2.gain.value = 8;
            
            // Create tremolo effect using LFO
            const elderlyTremolo = audioContext.createGain();
            const elderlyLFO = audioContext.createOscillator();
            const elderlyLFOGain = audioContext.createGain();
            
            elderlyLFO.frequency.value = 4.5; // Slight tremolo
            elderlyLFO.type = 'sine';
            elderlyLFOGain.gain.value = 0.2; // 20% tremolo depth
            
            elderlyLFO.connect(elderlyLFOGain);
            elderlyLFOGain.connect(elderlyTremolo.gain);
            elderlyTremolo.gain.value = 1.0;
            
            const elderlyCompressor = audioContext.createDynamicsCompressor();
            elderlyCompressor.threshold.value = -15;
            elderlyCompressor.knee.value = 30;
            elderlyCompressor.ratio.value = 15;
            elderlyCompressor.attack.value = 0.005;
            elderlyCompressor.release.value = 0.2;
            
            inputGain.disconnect();
            inputGain.connect(elderlyHighPass);
            elderlyHighPass.connect(elderlyLowPass);
            elderlyLowPass.connect(elderlyFormant1);
            elderlyFormant1.connect(elderlyFormant2);
            elderlyFormant2.connect(elderlyTremolo);
            elderlyTremolo.connect(elderlyCompressor);
            elderlyCompressor.connect(outputGain);
            
            elderlyLFO.start();
            
            inputGain.gain.value = 2.5;
            outputGain.gain.value = 0.4;
            break;
            
        case 'elderly-female':
            // Simulate elderly female voice
            const elderlyFemaleFilter1 = audioContext.createBiquadFilter();
            elderlyFemaleFilter1.type = 'lowpass';
            elderlyFemaleFilter1.frequency.value = 2500;
            elderlyFemaleFilter1.Q.value = 1;
            
            const elderlyFemaleFilter2 = audioContext.createBiquadFilter();
            elderlyFemaleFilter2.type = 'peaking';
            elderlyFemaleFilter2.frequency.value = 1000;
            elderlyFemaleFilter2.Q.value = 2;
            elderlyFemaleFilter2.gain.value = 2;
            
            inputGain.disconnect();
            inputGain.connect(elderlyFemaleFilter1);
            elderlyFemaleFilter1.connect(elderlyFemaleFilter2);
            elderlyFemaleFilter2.connect(outputGain);
            
            inputGain.gain.value = 1.25;
            outputGain.gain.value = 0.8;
            break;
            
        case 'male-child':
            // Bright filter for child male voice
            const maleChildFilter = audioContext.createBiquadFilter();
            maleChildFilter.type = 'peaking';
            maleChildFilter.frequency.value = 3000;
            maleChildFilter.Q.value = 3;
            maleChildFilter.gain.value = 12;
            
            inputGain.disconnect();
            inputGain.connect(maleChildFilter);
            maleChildFilter.connect(outputGain);
            
            inputGain.gain.value = 1.3;
            outputGain.gain.value = 1.2;
            break;
            
        case 'female-child':
            // Very bright filter for child female voice
            const femaleChildFilter = audioContext.createBiquadFilter();
            femaleChildFilter.type = 'peaking';
            femaleChildFilter.frequency.value = 4000;
            femaleChildFilter.Q.value = 4;
            femaleChildFilter.gain.value = 15;
            
            inputGain.disconnect();
            inputGain.connect(femaleChildFilter);
            femaleChildFilter.connect(outputGain);
            
            inputGain.gain.value = 1.4;
            outputGain.gain.value = 1.3;
            break;
            
        default:
            // Natural voice - no processing
            inputGain.gain.value = 1.0;
            outputGain.gain.value = 1.0;
            break;
    }
    
    return inputGain;
}

async function audioBufferToBlob(audioBuffer) {
    // Convert audio buffer to WAV format
    console.log('Converting audioBuffer to blob...');
    const numberOfChannels = audioBuffer.numberOfChannels;
    const length = audioBuffer.length * numberOfChannels * 2; // 16-bit samples
    console.log('WAV conversion params:', { numberOfChannels, length, totalSize: 44 + length });
    
    const buffer = new ArrayBuffer(44 + length);
    const view = new DataView(buffer);
    
    // WAV header
    const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, audioBuffer.sampleRate, true);
    view.setUint32(28, audioBuffer.sampleRate * numberOfChannels * 2, true);
    view.setUint16(32, numberOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length, true);
    
    // Convert audio data
    let offset = 44;
    for (let i = 0; i < audioBuffer.length; i++) {
        for (let channel = 0; channel < numberOfChannels; channel++) {
            const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[i]));
            view.setInt16(offset, sample * 0x7FFF, true);
            offset += 2;
        }
    }
    
    const blob = new Blob([buffer], { type: 'audio/wav' });
    console.log('WAV blob created:', { size: blob.size, type: blob.type });
    return blob;
}

// Note: Voice effects are now applied using post-processing to the recorded audio
// This ensures the effects are permanently applied to the saved recordings

function getEffectName(effect) {
    const effectNames = {
        'none': 'Natural',
        'male': 'Male',
        'female': 'Female', 
        'elderly-male': 'Elderly Male',
        'elderly-female': 'Elderly Female',
        'male-child': 'Male Child',
        'female-child': 'Female Child'
    };
    return effectNames[effect] || 'Unknown';
}

function stopRecording() {
    if (appState.mediaRecorder && appState.isRecording) {
        appState.mediaRecorder.stop();
        appState.isRecording = false;
        
        document.getElementById('recordBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;
        
        if (appState.recognition) {
            appState.recognition.stop();
        }
        
        showStatusMessage('Recording saved', 'success');
        
        // Auto-advance to next line
        setTimeout(() => {
            nextLine();
        }, 1000);
    }
}

function skipLine() {
    nextLine();
}

function rerecordLine() {
    const characterLines = appState.dialogueLines.filter(line => 
        line.character === appState.currentCharacter
    );
    const currentLine = characterLines[appState.currentLineIndex];
    
    // Remove the existing recording for this line
    if (appState.audioRecordings.has(appState.currentCharacter)) {
        appState.audioRecordings.get(appState.currentCharacter).delete(currentLine.number);
        console.log('Removed existing recording for', appState.currentCharacter, 'line', currentLine.number);
    }
    
    showStatusMessage('Ready to rerecord this line', 'info');
}

function previousLine() {
    const characterLines = appState.dialogueLines.filter(line => 
        line.character === appState.currentCharacter
    );
    
    if (appState.currentLineIndex > 0) {
        appState.currentLineIndex--;
        updateRecordingInterface();
    }
}

function nextLine() {
    const characterLines = appState.dialogueLines.filter(line => 
        line.character === appState.currentCharacter
    );
    
    if (appState.currentLineIndex < characterLines.length - 1) {
        appState.currentLineIndex++;
        updateRecordingInterface();
    } else {
        // Move to next character or finish recording
        const recordCharacters = Array.from(appState.recordCharacters);
        const currentIndex = recordCharacters.indexOf(appState.currentCharacter);
        
        if (currentIndex < recordCharacters.length - 1) {
            // Move to next character
            appState.currentCharacter = recordCharacters[currentIndex + 1];
            appState.currentLineIndex = 0;
            updateRecordingInterface();
        } else {
            // All characters recorded
            finishRecordingSession();
        }
    }
}

function finishRecordingSession() {
    showStatusMessage('Recording session completed', 'success');
    showSection('playback-section');
}

// Production Functions
function startProduction() {
    appState.isProductionMode = true;
    appState.productionLineIndex = 0;
    
    document.getElementById('startProductionBtn').disabled = true;
    document.getElementById('pauseProductionBtn').disabled = false;
    document.getElementById('stopProductionBtn').disabled = false;
    
    updateProductionInterface();
    showStatusMessage('Production started', 'success');
}

function pauseProduction() {
    appState.isProductionMode = false;
    
    document.getElementById('startProductionBtn').disabled = false;
    document.getElementById('pauseProductionBtn').disabled = true;
    
    showStatusMessage('Production paused', 'info');
}

function stopProduction() {
    appState.isProductionMode = false;
    appState.productionLineIndex = 0;
    
    // Stop speech recognition
    if (appState.recognition) {
        appState.recognition.stop();
    }
    
    // Clear any speech timeout
    if (appState.speechTimeout) {
        clearTimeout(appState.speechTimeout);
        appState.speechTimeout = null;
    }
    
    document.getElementById('startProductionBtn').disabled = false;
    document.getElementById('pauseProductionBtn').disabled = true;
    document.getElementById('stopProductionBtn').disabled = true;
    
    updateProductionInterface();
    showStatusMessage('Production stopped', 'info');
}

function updateProductionInterface() {
    console.log('updateProductionInterface called:', {
        productionLineIndex: appState.productionLineIndex,
        dialogueLinesLength: appState.dialogueLines.length,
        shouldStop: appState.productionLineIndex >= appState.dialogueLines.length
    });
    
    if (appState.productionLineIndex >= appState.dialogueLines.length) {
        // Production completed - stop everything
        appState.isProductionMode = false;
        
        // Stop speech recognition
        if (appState.recognition) {
            appState.recognition.stop();
        }
        
        // Clear any speech timeout
        if (appState.speechTimeout) {
            clearTimeout(appState.speechTimeout);
            appState.speechTimeout = null;
        }
        
        // Reset button states
        document.getElementById('startProductionBtn').disabled = false;
        document.getElementById('pauseProductionBtn').disabled = true;
        document.getElementById('stopProductionBtn').disabled = true;
        
        // Show completion message
        showStatusMessage('🎬 Production completed! Script finished.', 'success');
        
        // Update the interface to show completion
        document.getElementById('productionLineNumber').textContent = 'Complete';
        document.getElementById('productionTeleprompterText').textContent = '🎉 Script finished! Production complete.';
        
        return;
    }
    
    const currentLine = appState.dialogueLines[appState.productionLineIndex];
    
    document.getElementById('productionLineNumber').textContent = currentLine.number;
    document.getElementById('productionTeleprompterText').textContent = currentLine.dialogue;
    
    const playRecordings = document.getElementById('playRecordings').checked;
    const liveSpeaking = document.getElementById('liveSpeaking').checked;
    
    if (playRecordings && appState.recordCharacters.has(currentLine.character)) {
        // Play recorded audio
        console.log('Looking for recording for', currentLine.character, 'line', currentLine.number);
        console.log('Available recordings for', currentLine.character, ':', 
            appState.audioRecordings.get(currentLine.character) ? 
            Array.from(appState.audioRecordings.get(currentLine.character).keys()) : 'none');
        
        const audioBlob = appState.audioRecordings.get(currentLine.character)?.get(currentLine.number);
        if (audioBlob) {
            console.log('Playing recorded audio for', currentLine.character, 'line', currentLine.number);
            playAudioBlob(audioBlob);
            document.getElementById('statusText').textContent = 'Playing recorded audio';
        } else {
            console.log('No recording found for', currentLine.character, 'line', currentLine.number);
            document.getElementById('statusText').textContent = 'No recording found for this line';
            advanceProductionLine();
        }
    } else if (liveSpeaking && appState.speakCharacters.has(currentLine.character)) {
        // Wait for live speaking
        document.getElementById('statusText').textContent = 'Waiting for live speech...';
        if (appState.recognition && appState.recognition.state !== 'started') {
            try {
                appState.recognition.start();
            } catch (error) {
                console.log('Speech recognition already started, skipping');
            }
        }
    } else {
        // Skip this line
        document.getElementById('statusText').textContent = 'Skipping line';
        advanceProductionLine();
    }
}

function advanceProductionLine() {
    // Stop speech recognition before advancing
    if (appState.recognition) {
        appState.recognition.stop();
    }
    
    appState.productionLineIndex++;
    console.log('Advanced to production line', appState.productionLineIndex, 'of', appState.dialogueLines.length);
    
    setTimeout(() => {
        updateProductionInterface();
    }, 500);
}

function playAudioBlob(audioBlob) {
    const audio = new Audio();
    audio.src = URL.createObjectURL(audioBlob);
    
    audio.onended = function() {
        advanceProductionLine();
    };
    
    audio.onerror = function() {
        console.error('Error playing audio');
        advanceProductionLine();
    };
    
    audio.play();
}

// Utility Functions
function showSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.step-section').forEach(section => {
        section.classList.remove('active');
    });
    
    // Show target section
    document.getElementById(sectionId).classList.add('active');
}

function showStatusMessage(message, type = 'info') {
    const statusElement = document.getElementById('statusMessage');
    statusElement.textContent = message;
    statusElement.className = `status-message ${type} show`;
    
    setTimeout(() => {
        statusElement.classList.remove('show');
    }, 3000);
}

// Export functions for potential external use
window.ScriptTeleprompter = {
    appState,
    showStatusMessage,
    startRecording,
    stopRecording,
    startProduction,
    stopProduction
};