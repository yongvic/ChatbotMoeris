document.addEventListener('DOMContentLoaded', () => {
  const Chatbot = {
    // --- CONFIGURATION ---
    N8N_WEBHOOK_URL: 'https://d0b457174d36.ngrok-free.app/webhook/5f855f34-9111-4ef3-b95b-17a7d750d658',
    WHATSAPP_HUMAN_NUMBER: '22891480288',
    WHATSAPP_BOT_NUMBER: '22898832644', // Remplacez par le numéro du bot si différent

    // --- ÉTAT INTERNE ---
    isChatOpen: false, isRecording: false, mediaRecorder: null, audioChunks: [],
    timerInterval: null, audioStream: null, isLongPress: false, longPressTimer: null,
    sessionId: null,
    elements: {},

    init() {
      this.sessionId = crypto.randomUUID();
      this.elements = {
        chatToggleButton: document.getElementById('chatToggleButton'), chatWindow: document.getElementById('chatWindow'),
        closeChatButton: document.getElementById('closeChatButton'), clearChatButton: document.getElementById('clearChatButton'),
        chatMessages: document.getElementById('chatMessages'), chatInput: document.getElementById('chatInput'),
        actionButton: document.getElementById('actionButton'), actionIcon: document.getElementById('actionIcon'),
        typingIndicator: document.getElementById('typingIndicator'), recordingTimer: document.getElementById('recordingTimer'),
        emojiButton: document.getElementById('emojiButton'), emojiPickerContainer: document.getElementById('emojiPickerContainer'),
        emojiPicker: document.querySelector('emoji-picker'),
        whatsappRedirectButton: document.getElementById('whatsappRedirectButton'), whatsappModal: document.getElementById('whatsappModal'),
        closeModalBtn: document.getElementById('closeModalBtn'), waBotLink: document.getElementById('waBotLink'),
        waHumanLink: document.getElementById('waHumanLink'),
      };
      this.setupWhatsappLinks();
      this.bindEvents();
      this.checkConfig();
      setTimeout(() => this.addWelcomeMessage(), 500);
    },

    setupWhatsappLinks() {
      this.elements.waHumanLink.href = `https://wa.me/${this.WHATSAPP_HUMAN_NUMBER}`;
      this.elements.waBotLink.href = `https://wa.me/${this.WHATSAPP_BOT_NUMBER}`;
    },

    bindEvents() {
      const { elements } = this;
      elements.chatToggleButton.addEventListener('click', (e) => { e.stopPropagation(); this.toggleChatWindow(); });
      elements.closeChatButton.addEventListener('click', () => this.toggleChatWindow());
      elements.clearChatButton.addEventListener('click', () => this.clearChat());
      elements.whatsappRedirectButton.addEventListener('click', () => this.showWhatsappModal());
      elements.closeModalBtn.addEventListener('click', () => this.hideWhatsappModal());
      elements.whatsappModal.addEventListener('click', (e) => { if (e.target === elements.whatsappModal) this.hideWhatsappModal(); });
      document.addEventListener('click', (e) => { if (this.isChatOpen && !elements.chatWindow.contains(e.target) && !elements.chatToggleButton.contains(e.target) && !elements.emojiPickerContainer.contains(e.target)) { this.toggleChatWindow(); } });
      elements.chatWindow.addEventListener('click', (e) => e.stopPropagation());
      elements.chatInput.addEventListener('input', () => this.handleTextInput());
      elements.chatInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendTextMessage(); } });
      const actionUp = () => { clearTimeout(this.longPressTimer); if (this.isLongPress) this.stopRecording(); this.isLongPress = false; };
      elements.actionButton.addEventListener('click', () => { if (!this.isLongPress) this.sendTextMessage(); });
      elements.actionButton.addEventListener('mousedown', () => { this.longPressTimer = setTimeout(() => { this.isLongPress = true; this.startRecording(); }, 200); });
      elements.actionButton.addEventListener('mouseup', actionUp);
      elements.actionButton.addEventListener('mouseleave', actionUp);
      elements.actionButton.addEventListener('touchstart', e => { e.preventDefault(); this.longPressTimer = setTimeout(() => { this.isLongPress = true; this.startRecording(); }, 200); }, { passive: false });
      elements.actionButton.addEventListener('touchend', actionUp);
      elements.emojiButton.addEventListener('click', e => { e.stopPropagation(); this.toggleEmojiPicker(); });
      elements.emojiPicker.addEventListener('emoji-click', e => this.insertEmoji(e.detail.unicode));
    },

    showWhatsappModal() { this.elements.whatsappModal.classList.add('visible'); },
    hideWhatsappModal() { this.elements.whatsappModal.classList.remove('visible'); },

    addWelcomeMessage() {
      this.addMessage("Bonjour ! Je suis l'assistant virtuel de la Résidence Moeris. Comment puis-je vous aider ?", 'bot');
      const replies = [
        { text: 'Voir les chambres', icon: 'fa-bed' },
        { text: 'Nos services', icon: 'fa-concierge-bell' },
        { text: 'Nous contacter', icon: 'fa-phone' }
      ];
      const repliesContainer = document.createElement('div');
      repliesContainer.className = 'quick-replies-container';
      replies.forEach(reply => {
        const button = document.createElement('button');
        button.className = 'quick-reply-btn';
        button.innerHTML = `<i class="fas ${reply.icon}"></i> <span>${reply.text}</span>`;
        button.onclick = () => {
          this.sendQuickReply(reply.text);
          repliesContainer.remove();
        };
        repliesContainer.appendChild(button);
      });
      this.elements.chatMessages.appendChild(repliesContainer);
      this.scrollToBottom();
    },

    sendQuickReply(text) {
      this.addMessage(text, 'user');
      const formData = new FormData();
      formData.append('type', 'text');
      formData.append('chatInput', text);
      formData.append('sessionId', this.sessionId);
      this.sendToN8n(formData);
    },

    createMessageBubble(sender) {
      const bubble = document.createElement('div');
      const bubbleTypeClass = sender === 'user' ? 'user-bubble rounded-br-none' : 'bot-bubble rounded-bl-none';
      bubble.className = `p-3 rounded-2xl max-w-[85%] message-bubble ${bubbleTypeClass}`;
      return bubble;
    },

    appendMessage(bubbleElement) {
      const wrapper = document.createElement('div');
      const sender = bubbleElement.classList.contains('user-bubble') ? 'user' : 'bot';
      wrapper.className = `flex message-wrapper ${sender === 'user' ? 'justify-end' : 'justify-start'}`;
      wrapper.appendChild(bubbleElement);
      this.elements.chatMessages.appendChild(wrapper);
      this.scrollToBottom();
    },

    async sendToN8n(payload) { this.showTypingIndicator(true); try { const response = await fetch(this.N8N_WEBHOOK_URL, { method: 'POST', body: payload }); if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`); const result = await response.json(); if (Array.isArray(result) && result.length > 0 && result[0].responseText) { this.addMessage(result[0].responseText, 'bot'); } } catch (error) { console.error('Erreur n8n:', error); this.addMessage("Désolé, une erreur de communication est survenue.", 'bot'); } finally { this.showTypingIndicator(false); } },
    checkConfig() { if (!this.N8N_WEBHOOK_URL || this.N8N_WEBHOOK_URL === 'PASTE_YOUR_N8N_WEBHOOK_URL_HERE') { console.error("ERREUR CRITIQUE: L'URL du webhook N8N n'est pas configurée."); this.addMessage("Oups ! Il semble que je ne sois pas correctement configuré.", 'bot'); this.elements.chatInput.disabled = true; this.elements.actionButton.disabled = true; } },
    toggleChatWindow() { this.isChatOpen = !this.isChatOpen; this.elements.chatWindow.classList.toggle('open'); this.elements.chatToggleButton.classList.toggle('open'); if (this.isChatOpen) { this.elements.chatInput.focus(); } },
    clearChat() { this.elements.chatMessages.innerHTML = ''; this.addWelcomeMessage(); },
    addMessage(content, sender) { const bubble = this.createMessageBubble(sender); const escapedContent = document.createElement('div'); escapedContent.textContent = content; bubble.innerHTML = this.parseSimpleMarkdown(escapedContent.innerHTML); this.appendMessage(bubble); },
    addAudioMessage(url, sender) { const bubble = this.createMessageBubble(sender); const audioId = `audio-${Date.now()}`; bubble.innerHTML = `<div class="audio-player" id="${audioId}"><button class="play-pause-btn"><i class="fas fa-play"></i></button><div class="progress-bar-container"><div class="progress-bar"></div></div><span class="audio-duration">--:--</span></div>`; this.appendMessage(bubble); setTimeout(() => this.setupAudioPlayer(audioId, url), 0); },
    sendTextMessage() { const text = this.elements.chatInput.value.trim(); if (!text) return; this.addMessage(text, 'user'); const formData = new FormData(); formData.append('type', 'text'); formData.append('chatInput', text); formData.append('sessionId', this.sessionId); this.sendToN8n(formData); this.elements.chatInput.value = ''; this.handleTextInput(); },
    async startRecording() { if (this.elements.chatInput.value.trim().length > 0) return; if (this.isRecording) return; if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { this.addMessage("Désolé, votre navigateur ne supporte pas l'enregistrement vocal.", 'bot'); return; } try { this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true }); this.isRecording = true; this.audioChunks = []; this.elements.actionButton.classList.add('recording'); this.elements.recordingTimer.classList.remove('hidden'); this.elements.chatInput.disabled = true; this.mediaRecorder = new MediaRecorder(this.audioStream); this.mediaRecorder.start(); let seconds = 0; this.timerInterval = setInterval(() => { seconds++; this.elements.recordingTimer.textContent = `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`; }, 1000); this.mediaRecorder.ondataavailable = e => this.audioChunks.push(e.data); this.mediaRecorder.onstop = async () => { const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' }); if (audioBlob.size > 500) { const audioUrl = URL.createObjectURL(audioBlob); this.addAudioMessage(audioUrl, 'user'); const formData = new FormData(); formData.append('type', 'audio'); formData.append('file', audioBlob, 'recording.webm'); formData.append('sessionId', this.sessionId); await this.sendToN8n(formData); } if (this.audioStream) this.audioStream.getTracks().forEach(track => track.stop()); }; } catch (err) { console.error("Erreur de microphone:", err); if (err.name === 'NotAllowedError') { this.addMessage("Vous avez refusé l'accès au microphone.", 'bot'); } else { this.addMessage("Impossible d'accéder au microphone. Assurez-vous d'être sur une page HTTPS.", 'bot'); } this.isLongPress = false; this.stopRecording(); } },
    stopRecording() { if (!this.isRecording) return; if (this.mediaRecorder && this.mediaRecorder.state === "recording") { this.mediaRecorder.stop(); } clearInterval(this.timerInterval); this.isRecording = false; this.elements.actionButton.classList.remove('recording'); this.elements.recordingTimer.classList.add('hidden'); this.elements.recordingTimer.textContent = "0:00"; this.elements.chatInput.disabled = false; },
    setupAudioPlayer(id, url) { const player = document.getElementById(id); if (!player) return; const audio = new Audio(url); const playBtn = player.querySelector('.play-pause-btn i'); const progressBar = player.querySelector('.progress-bar'); const durationSpan = player.querySelector('.audio-duration'); const progressBarContainer = player.querySelector('.progress-bar-container'); const formatTime = (time) => `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`; audio.addEventListener('loadedmetadata', () => { durationSpan.textContent = formatTime(audio.duration); }); audio.addEventListener('timeupdate', () => { progressBar.style.width = `${(audio.currentTime / audio.duration) * 100}%`; }); audio.addEventListener('ended', () => { playBtn.classList.replace('fa-pause', 'fa-play'); }); playBtn.parentElement.addEventListener('click', () => { if (audio.paused) { audio.play(); playBtn.classList.replace('fa-play', 'fa-pause'); } else { audio.pause(); playBtn.classList.replace('fa-pause', 'fa-play'); } }); progressBarContainer.addEventListener('click', (e) => { const rect = progressBarContainer.getBoundingClientRect(); const clickPosition = (e.clientX - rect.left) / rect.width; audio.currentTime = clickPosition * audio.duration; }); },
    scrollToBottom() { this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight; },
    showTypingIndicator(show) { this.elements.typingIndicator.classList.toggle('hidden', !show); if (show) this.scrollToBottom(); },
    handleTextInput() { const hasText = this.elements.chatInput.value.trim().length > 0; this.elements.actionIcon.classList.toggle('fa-paper-plane', hasText); this.elements.actionIcon.classList.toggle('fa-microphone', !hasText); this.adjustTextareaHeight(); },
    adjustTextareaHeight() { const ta = this.elements.chatInput; ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`; },
    toggleEmojiPicker() { this.elements.emojiPickerContainer.classList.toggle('visible'); },
    insertEmoji(unicode) { this.elements.chatInput.value += unicode; this.handleTextInput(); this.elements.chatInput.focus(); },
    parseSimpleMarkdown(text) {
      return text
        // Rend le gras (**texte**) en <strong>
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        // Rend l'italique (*texte*) en <em>
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        // NOUVEAU : Rend les liens [texte](url) en <a href="url">
        .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color: var(--brand-color); text-decoration: underline;">$1</a>');
    }
  };

  Chatbot.init();
});