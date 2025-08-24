document.addEventListener('DOMContentLoaded', () => {
    // --- Page Elements ---
    const welcomeScreen = document.getElementById('welcome-screen');
    const startBtn = document.getElementById('start-btn');
    const chatContainer = document.getElementById('chat-container');
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const chatBox = document.getElementById('chat-box');
    const micBtn = document.getElementById('mic-btn');
    const statusIndicator = document.getElementById('status-indicator');
    const stopGeneratingBtn = document.getElementById('stop-generating-btn');
    const stopGeneratingContainer = document.getElementById('stop-generating-container');
    const backendUrl = 'https://socrates-ai-backend.onrender.com/api/chat';

    // --- State ---
    const initialAssistantMessage = "What is it you'd like to learn or understand today?";
    let chatHistory = [{ role: 'assistant', content: initialAssistantMessage }];
    let isListening = false;
    let activeSpeakerIcon = null;
    let abortController = new AbortController(); // For stopping generation

    // --- Speech Recognition Setup ---
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition;

    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US'; // Can be changed dynamically

        recognition.onresult = (event) => {
            let finalTranscript = '';
            for (let i = 0; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                }
            }
            const lastResult = event.results[event.results.length - 1];
            if (!lastResult.isFinal) {
                const interimTranscript = lastResult[0].transcript;
                userInput.value = finalTranscript + interimTranscript;
            } else {
                userInput.value = finalTranscript;
            }
        };

        recognition.onend = () => { if (isListening) { recognition.start(); } };
        recognition.onerror = (event) => { console.error('Speech recognition error:', event.error); stopListening(); };
    } else {
        micBtn.style.display = 'none';
        console.warn('Speech Recognition not supported in this browser.');
    }

    // --- Event Listeners ---
    startBtn.addEventListener('click', () => {
        welcomeScreen.style.opacity = '0';
        setTimeout(() => {
            welcomeScreen.classList.add('hidden');
            chatContainer.classList.remove('hidden');
            chatContainer.style.animation = 'fadeIn 0.5s ease-out';
            displayMessage(initialAssistantMessage, 'assistant');
        }, 500);
    });

    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        stopAllSpeaking();
        const userMessage = userInput.value.trim();
        if (userMessage === '') return;
        stopListening();
        processUserMessage(userMessage);
    });

    micBtn.addEventListener('click', () => {
        if (!SpeechRecognition) return;
        stopAllSpeaking();
        isListening ? stopListening() : startListening();
    });
    
    stopGeneratingBtn.addEventListener('click', () => {
        abortController.abort(); // Abort the fetch request
        stopGeneratingContainer.classList.add('hidden');
    });

    window.onbeforeunload = () => {
        speechSynthesis.cancel();
    };

    // --- Core Functions ---
    function startListening() {
        isListening = true;
        micBtn.classList.add('listening');
        statusIndicator.classList.remove('hidden');
        userInput.placeholder = "Listening... say your topic.";
        recognition.start();
    }

    function stopListening() {
        isListening = false;
        micBtn.classList.remove('listening');
        statusIndicator.classList.add('hidden');
        userInput.placeholder = "What topic do you want to explore?";
        if (recognition) {
            recognition.stop();
        }
    }
    
    async function processUserMessage(userMessage) {
        displayMessage(userMessage, 'user');
        chatHistory.push({ role: 'user', content: userMessage });
        userInput.value = '';
        userInput.focus();

        stopGeneratingContainer.classList.remove('hidden');
        abortController = new AbortController(); // Reset controller for the new request

        try {
            const response = await fetch(backendUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: userMessage,
                    history: chatHistory.slice(0, -1)
                }),
                signal: abortController.signal, // Pass the signal to fetch
            });
            
            if (response.status === 429) {
                displayMessage("Free API limit reached. Please try again tomorrow.", 'assistant');
                return;
            }
            if (!response.ok) {
                throw new Error(`Server error! status: ${response.status}`);
            }
            
            const assistantMessageElement = displayMessage('', 'assistant');
            const fullResponse = await typeText(assistantMessageElement, response);
            chatHistory.push({ role: 'assistant', content: fullResponse });
            
        } catch (error) {
            if (error.name === 'AbortError') {
                const stoppedMessage = displayMessage('', 'assistant');
                stoppedMessage.textContent = 'Response stopped.';
                addMessageActions(stoppedMessage, 'Response stopped.');
            } else {
                let errorMessage = 'An unexpected error occurred.';
                if (!navigator.onLine) {
                    errorMessage = "Network connection lost. Please check your internet.";
                } else if (error instanceof TypeError) {
                    errorMessage = "There might be an issue with the server address.";
                }
                displayMessage(errorMessage, 'assistant');
            }
        } finally {
            stopGeneratingContainer.classList.add('hidden');
        }
    }

    async function typeText(element, response) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';
        element.innerHTML = ''; // Clear for typing

        const cursor = document.createElement('span');
        cursor.classList.add('typing-cursor');
        element.appendChild(cursor);

        while (true) {
            const { value, done } = await reader.read();
            if (done) {
                cursor.remove();
                addMessageActions(element, fullResponse); // Add buttons when typing is complete
                break;
            }
            const chunk = decoder.decode(value, { stream: true });
            fullResponse += chunk;
            element.insertBefore(document.createTextNode(chunk), cursor);
            chatBox.scrollTop = chatBox.scrollHeight;
        }
        return fullResponse;
    }

    // --- Helper Functions ---
    function displayMessage(message, sender) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('chat-message', `${sender}-message`);
        messageElement.textContent = message;
        chatBox.appendChild(messageElement);
        chatBox.scrollTop = chatBox.scrollHeight;
        
        if (sender === 'assistant' && message) {
            addMessageActions(messageElement, message);
        }
        return messageElement;
    }
    
    function resetActiveIcon() {
        if (activeSpeakerIcon) {
            activeSpeakerIcon.classList.remove('fa-stop-circle');
            activeSpeakerIcon.classList.add('fa-volume-up');
            activeSpeakerIcon = null;
        }
    }

    function stopAllSpeaking() {
        speechSynthesis.cancel();
        resetActiveIcon();
    }

    function speak(text, iconElement) {
        if (speechSynthesis.speaking && iconElement === activeSpeakerIcon) {
            stopAllSpeaking();
            return;
        }
        stopAllSpeaking();

        if (text !== '') {
            const utterance = new SpeechSynthesisUtterance(text);
            const urduRegex = /[\u0600-\u06FF]/;
            if (urduRegex.test(text)) {
                utterance.lang = 'ur-PK';
                utterance.rate = 0.9; 
            } else {
                utterance.lang = 'en-US';
            }
            
            utterance.onend = () => { resetActiveIcon(); };
            speechSynthesis.speak(utterance);
            
            activeSpeakerIcon = iconElement;
            iconElement.classList.remove('fa-volume-up');
            iconElement.classList.add('fa-stop-circle');
        }
    }

    function addMessageActions(messageElement, textToSpeak) {
        const actionsContainer = document.createElement('div');
        actionsContainer.classList.add('message-actions');

        const copyBtn = document.createElement('button');
        copyBtn.innerHTML = '<i class="fa fa-copy"></i>';
        copyBtn.title = 'Copy text';
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(textToSpeak).then(() => {
                copyBtn.innerHTML = '<i class="fa fa-check"></i>';
                setTimeout(() => { copyBtn.innerHTML = '<i class="fa fa-copy"></i>'; }, 2000);
            });
        });

        const speakerBtn = document.createElement('button');
        speakerBtn.innerHTML = '<i class="fa fa-volume-up"></i>';
        speakerBtn.title = 'Read aloud';
        speakerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            speak(textToSpeak, speakerBtn.querySelector('i'));
        });

        actionsContainer.appendChild(copyBtn);
        actionsContainer.appendChild(speakerBtn);
        messageElement.appendChild(actionsContainer);
    }
});