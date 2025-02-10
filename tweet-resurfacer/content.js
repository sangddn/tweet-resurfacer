(function () {
    const DEBUG_MODE = false;
    const ONE_MINUTE = 60 * 1000;
    const ONE_DAY = DEBUG_MODE ? (ONE_MINUTE) : (24 * 60 * 60 * 1000); // 2 minutes in debug mode
    const ONE_YEAR = DEBUG_MODE ? (15 * ONE_MINUTE) : (365 * ONE_DAY); // 1 hour in debug mode
    const MINIMUM_TWEET_GAP = 5; // Minimum tweets between resurfaced content
    const SCROLL_THRESHOLD = 100; // px from bottom to trigger new insertions
    const VIEWPORT_BUFFER = 2; // Number of screens worth of buffer

    // Add debug logging function
    function debugLog(message, data = null) {
        if (DEBUG_MODE) {
            console.log(`[DEBUG] ${message}`, data || '');
        }
    }

    /** 
     * Adds "Save Tweet" buttons to the timeline
     */
    function addSaveButtons() {
        // More inclusive selectors for different timelines and threads
        const timelineSelectors = [
            '[data-testid="primaryColumn"]',                         // Generic timeline container
            'section[role="region"]',                                // Timeline section
            'div[data-testid="cellInnerDiv"]',                      // Tweet container
            'div[data-testid="tweet"]',                             // Individual tweet
            'article'                                                // Fallback
        ];

        let timelineContainer = null;
        for (const selector of timelineSelectors) {
            timelineContainer = document.querySelector(selector);
            if (timelineContainer) {
                debugLog('Found timeline container:', selector);
                break;
            }
        }

        if (!timelineContainer) {
            debugLog("Timeline container not found, will retry");
            setTimeout(addSaveButtons, 1000);
            return;
        }

        // Process existing tweets immediately
        debugLog("Processing existing tweets");
        const tweetSelectors = [
            'article[data-testid="tweet"]',
            'div[data-testid="tweet"]',
            'div[data-testid="cellInnerDiv"]',
            'article'
        ];

        let existingTweets = [];
        for (const selector of tweetSelectors) {
            existingTweets = timelineContainer.querySelectorAll(selector);
            if (existingTweets.length > 0) {
                debugLog(`Found ${existingTweets.length} tweets with selector: ${selector}`);
                break;
            }
        }

        existingTweets.forEach(tweet => processTweet(tweet));

        // Set up observer for new tweets with error handling
        try {
            const observer = new MutationObserver(mutations => {
                try {
                    mutations.forEach(mutation => {
                        mutation.addedNodes.forEach(node => {
                            if (!node || node.nodeType !== Node.ELEMENT_NODE) return;

                            // Try multiple selectors for tweets
                            if (node.matches('article[data-testid="tweet"]') ||
                                node.matches('div[data-testid="tweet"]') ||
                                node.matches('div[data-testid="cellInnerDiv"]') ||
                                node.matches('article')) {
                                debugLog("Processing tweet node");
                                processTweet(node);
                            } else {
                                // Search for tweets within the added node
                                const tweets = node.querySelectorAll(tweetSelectors.join(','));
                                debugLog(`Found ${tweets.length} tweets in node`);
                                tweets.forEach(tweet => processTweet(tweet));
                            }
                        });
                    });
                } catch (err) {
                    if (err.message.includes('Extension context invalidated')) {
                        observer.disconnect();
                        debugLog('Extension context invalidated, observer disconnected');
                    } else {
                        debugLog('Error in mutation observer:', err);
                    }
                }
            });

            observer.observe(timelineContainer, { childList: true, subtree: true });
            debugLog("Observer started");
        } catch (err) {
            debugLog('Error setting up observer:', err);
        }
    }

    function processTweet(tweetElement) {
        try {
            // Avoid duplicate buttons
            if (tweetElement.querySelector('.save-tweet-button')) {
                debugLog('Skip: Tweet already has save button');
                return;
            }

            // Find a link that contains "/status/" – that is the tweet URL
            const link = tweetElement.querySelector('a[href*="/status/"]');
            if (!link) {
                debugLog('Skip: No tweet URL found');
                return;
            }

            // Find the actions container - try multiple selectors
            const actionSelectors = [
                'div[role="group"]',
                'div[data-testid="tweet-actions"]',
                '.tweet-actions'
            ];

            let actionsContainer = null;
            for (const selector of actionSelectors) {
                actionsContainer = tweetElement.querySelector(selector);
                if (actionsContainer) break;
            }

            if (!actionsContainer) {
                debugLog('Skip: No actions container found');
                return;
            }

            debugLog('Found tweet:', {
                url: link.href,
                actionsContainer: actionsContainer
            });

            const url = link.href;
            // Extract tweet ID from the URL
            const match = url.match(/status\/(\d+)/);
            if (!match) return;
            const tweetId = match[1];

            // Extract tweet content and metrics
            const tweetTextElement = tweetElement.querySelector('[data-testid="tweetText"]');
            const tweetText = tweetTextElement ? tweetTextElement.innerText : "";

            // Get social metrics
            const metrics = {
                likes: tweetElement.querySelector('[data-testid="like"]')?.textContent || "0",
                retweets: tweetElement.querySelector('[data-testid="retweet"]')?.textContent || "0",
                replies: tweetElement.querySelector('[data-testid="reply"]')?.textContent || "0",
                views: tweetElement.querySelector('[aria-label*="View Tweet analytics"]')?.textContent || "0"
            };

            // Get media content
            const mediaContainer = tweetElement.querySelector('[data-testid="tweetPhoto"], [data-testid="tweetVideo"]');
            const mediaUrl = mediaContainer?.querySelector('img')?.src || null;

            // Get quoted tweet if exists
            const quotedTweet = tweetElement.querySelector('[data-testid="tweet-quoted-tweet"]');
            const quotedTweetUrl = quotedTweet?.querySelector('a[href*="/status/"]')?.href || null;

            // Get any external links
            const links = Array.from(tweetElement.querySelectorAll('a[href]:not([href*="/status/"])')).map(a => a.href);

            // Get timestamp before saving
            const timestamp = tweetElement.querySelector('time')?.dateTime || null;

            // Derive the username from the tweet URL
            try {
                const urlObj = new URL(url);
                const pathParts = urlObj.pathname.split('/');
                const username = pathParts[1];
                const handle = '@' + username;
                const accountLink = `https://x.com/${username}`;

                // Update profile picture selector to handle new Twitter/X UI
                debugLog('Looking for profile picture...');
                const avatarContainer = tweetElement.querySelector('div[data-testid="Tweet-User-Avatar"]');
                debugLog('Avatar container found:', avatarContainer);

                // Function to find profile image
                const findProfileImage = () => {
                    // Try multiple selectors to find the profile image
                    const profileImgEl =
                        // First try: direct img with profile_images in src
                        avatarContainer?.querySelector('img[src*="profile_images"]') ||
                        // Second try: div with background-image style
                        avatarContainer?.querySelector('div[style*="background-image"]') ||
                        // Third try: background-image on any nested div
                        avatarContainer?.querySelector('div[class*="r-1niwhzg"]');

                    debugLog('Profile image element:', profileImgEl);

                    // Get the URL from either src attribute or background-image style
                    let profilePic = "";
                    if (profileImgEl) {
                        if (profileImgEl.tagName === 'IMG') {
                            profilePic = profileImgEl.src;
                        } else {
                            // Extract URL from background-image style
                            const bgImage = window.getComputedStyle(profileImgEl).backgroundImage;
                            const urlMatch = bgImage.match(/url\("(.+)"\)/);
                            if (urlMatch) {
                                profilePic = urlMatch[1];
                            }
                        }
                    }
                    return profilePic;
                };

                // Try to find profile image immediately
                let profilePic = findProfileImage();

                // If not found, observe for changes
                if (!profilePic && avatarContainer) {
                    debugLog('Setting up observer for profile picture...');
                    const observer = new MutationObserver((mutations, obs) => {
                        profilePic = findProfileImage();
                        if (profilePic) {
                            debugLog('Profile picture found by observer:', profilePic);
                            obs.disconnect();
                        }
                    });

                    observer.observe(avatarContainer, {
                        childList: true,
                        subtree: true,
                        attributes: true,
                        attributeFilter: ['style', 'src']
                    });

                    // Disconnect after 5 seconds to prevent memory leaks
                    setTimeout(() => observer.disconnect(), 5000);
                }

                debugLog('Initial profile picture value:', profilePic);

                // Create a container div similar to other action buttons
                const buttonContainer = document.createElement('div');
                buttonContainer.className = 'css-175oi2r r-18u37iz r-1h0z5md r-13awgt0';
                buttonContainer.style.padding = '0 4px'; // Add padding around the container

                // Create the save button with Twitter's exact styling
                const btn = document.createElement('button');
                btn.className = 'save-tweet-button css-175oi2r r-1777fci r-bt1l66 r-bztko3 r-lrvibr r-1loqt21 r-1ny4l3l';
                btn.setAttribute('role', 'button');
                btn.style.color = 'rgb(113, 118, 123)';
                btn.style.margin = '0 4px'; // Add margin to the button itself

                // Create the inner div structure matching Twitter's format
                const innerDiv = document.createElement('div');
                innerDiv.className = 'css-146c3p1 r-bcqeeo r-1ttztb7 r-qvutc0 r-37j5jr r-a023e6 r-rjixqe r-16dba41 r-1awozwy r-6koalj r-1h0z5md r-o7ynqc r-clp7b1 r-3s2u2q';
                innerDiv.style.color = 'rgb(113, 118, 123)';

                // Add the text "Save"
                const textDiv = document.createElement('div');
                textDiv.className = 'css-1jxf684 r-bcqeeo r-1ttztb7 r-qvutc0 r-poiln3';

                // Function to update button state
                const updateButtonState = () => {
                    chrome.storage.local.get({ savedTweets: {} }, function (result) {
                        const isSaved = result.savedTweets[tweetId] !== undefined;
                        textDiv.innerText = isSaved ? 'Saved 🏄' : 'Save';
                        btn.disabled = false;
                    });
                };

                // Initial button state
                updateButtonState();

                // Assemble the button hierarchy
                innerDiv.appendChild(textDiv);
                btn.appendChild(innerDiv);
                buttonContainer.appendChild(btn);

                btn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    e.preventDefault();

                    chrome.storage.local.get({ savedTweets: {} }, function (result) {
                        const savedTweets = result.savedTweets;
                        const isSaved = savedTweets[tweetId] !== undefined;

                        if (isSaved) {
                            delete savedTweets[tweetId];
                        } else {
                            savedTweets[tweetId] = {
                                id: tweetId,
                                text: tweetText,
                                url: url,
                                profilePic: profilePic,
                                handle: handle,
                                accountLink: accountLink,
                                timestamp: timestamp,
                                metrics: metrics,
                                mediaUrl: mediaUrl,
                                quotedTweetUrl: quotedTweetUrl,
                                links: links,
                                interval: ONE_DAY,
                                nextReview: Date.now() + ONE_DAY,
                                lastReviewed: null,
                                reviewCount: 0
                            };
                        }

                        chrome.storage.local.set({ savedTweets }, function () {
                            if (chrome.runtime.lastError) {
                                console.error('Storage error:', chrome.runtime.lastError);
                                return;
                            }
                            debugLog(isSaved ? "Tweet unsaved." : "Tweet saved for review.");
                            updateButtonState(); // Update button state after save/unsave
                        });
                    });
                });

                debugLog('Attempting to insert save button');
                // Insert before the share button (which is in the last container)
                const lastButtonContainer = actionsContainer.lastElementChild;
                actionsContainer.insertBefore(buttonContainer, lastButtonContainer);
                debugLog('Save button inserted successfully');

                // Add a visual check
                debugLog('Button visible:', buttonContainer.offsetHeight > 0);
                debugLog('Button container:', buttonContainer);
            } catch (err) {
                debugLog("Error processing tweet:", err);
            }
        } catch (err) {
            debugLog('Error processing tweet:', err);
        }
    }

    // Add test function to simulate saving and checking tweets
    function runTests() {
        if (!DEBUG_MODE) return;

        debugLog('Starting tests...');

        // Test 1: Save a tweet
        const testTweet = {
            id: 'test123',
            text: 'Test tweet content',
            url: 'https://x.com/test/status/test123',
            profilePic: 'https://pbs.twimg.com/profile_images/default.jpg',
            handle: '@sangddn',
            accountLink: 'https://x.com/sangddn'
        };

        saveTweet(testTweet);
        debugLog('Test 1: Tweet saved');

        // Test 2: Check if tweet is stored correctly
        chrome.storage.local.get({ savedTweets: {} }, function (result) {
            const savedTweet = result.savedTweets['test123'];
            if (savedTweet) {
                debugLog('Test 2: Tweet retrieved successfully', savedTweet);
                debugLog('Next review scheduled for', new Date(savedTweet.nextReview));

                // Test 3: Verify review timing
                const reviewIn = savedTweet.nextReview - Date.now();
                debugLog('Will be reviewed in (ms):', reviewIn);
                if (reviewIn <= ONE_DAY && reviewIn > 0) {
                    debugLog('Test 3: Review timing correct');
                }
            }
        });

        // Test 4: Check review scheduling
        setTimeout(() => {
            chrome.storage.local.get({ savedTweets: {} }, function (result) {
                const dueTweets = Object.values(result.savedTweets)
                    .filter(tweet => tweet && tweet.nextReview <= Date.now());
                debugLog('Test 4: Due tweets after 2.5 minutes:', dueTweets);
            });
        }, 2.5 * ONE_MINUTE);
    }

    // Modify saveTweet to include debug info
    function saveTweet(tweetData) {
        try {
            if (!chrome?.storage?.local) {
                console.error('Chrome storage API not available');
                return;
            }

            chrome.storage.local.get({ savedTweets: {} }, function (result) {
                if (chrome.runtime.lastError) {
                    console.error('Storage error:', chrome.runtime.lastError);
                    return;
                }

                const savedTweets = result.savedTweets;
                if (savedTweets[tweetData.id]) {
                    console.log("Tweet already saved.");
                    return;
                }
                const now = Date.now();
                tweetData.interval = ONE_DAY;
                tweetData.nextReview = now + ONE_DAY;
                tweetData.lastReviewed = null;
                tweetData.reviewCount = 0;

                savedTweets[tweetData.id] = tweetData;
                chrome.storage.local.set({ savedTweets: savedTweets }, function () {
                    if (chrome.runtime.lastError) {
                        console.error('Storage error:', chrome.runtime.lastError);
                        return;
                    }
                    console.log("Tweet saved for review.", {
                        tweetData,
                        nextReviewIn: ONE_DAY / 1000 + ' seconds',
                        nextReviewAt: new Date(tweetData.nextReview).toLocaleString()
                    });
                });
            });
        } catch (error) {
            console.error('Error saving tweet:', error);
        }
    }

    /** 
     * Tweet resurfacing functionality
     */

    // Create a tweet element that mimics Twitter's UI.
    function createTweetElement(tweetData) {
        const article = document.createElement('article');
        article.setAttribute('role', 'article');
        article.setAttribute('data-testid', 'tweet');
        article.setAttribute('data-tweet-id', tweetData.id);
        article.className = 'saved-tweet-timeline';

        const styles = document.createElement('style');
        styles.textContent = `
            .saved-tweet-timeline {
                padding: 12px 16px;
                border-bottom: 1px solid rgb(47, 51, 54);
                cursor: pointer;
                background: rgb(0, 0, 0);
                transition: background-color 0.1s;
            }
            .saved-tweet-timeline:hover {
                background: rgba(255, 255, 255, 0.03);
            }
            .saved-tweet-timeline .tweet-container {
                display: flex;
                gap: 12px;
            }
            .saved-tweet-timeline .profile-pic {
                width: 48px;
                height: 48px;
                border-radius: 50%;
            }
            .saved-tweet-timeline .content {
                flex-grow: 1;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            }
            .saved-tweet-timeline .tweet-header {
                display: flex;
                align-items: center;
                gap: 4px;
                margin-bottom: 4px;
            }
            .saved-tweet-timeline .handle {
                color: rgb(231, 233, 234);
                font-weight: 700;
                text-decoration: none;
                font-size: 15px;
            }
            .saved-tweet-timeline .handle:hover {
                text-decoration: underline;
            }
            .saved-tweet-timeline .tweet-metadata {
                color: rgb(113, 118, 123);
                font-size: 15px;
            }
            .saved-tweet-timeline .dot-separator {
                padding: 0 4px;
                color: rgb(113, 118, 123);
            }
            .saved-tweet-timeline .tweet-text {
                color: rgb(231, 233, 234);
                font-size: 15px;
                line-height: 20px;
                margin-bottom: 12px;
                white-space: pre-wrap;
            }
            .saved-tweet-timeline .tweet-media {
                margin: 12px 0;
                border-radius: 16px;
                overflow: hidden;
                border: 1px solid rgb(47, 51, 54);
            }
            .saved-tweet-timeline .tweet-media img {
                width: 100%;
                height: auto;
                display: block;
            }
            .saved-tweet-timeline .quoted-tweet {
                border: 1px solid rgb(47, 51, 54);
                border-radius: 12px;
                padding: 12px;
                margin: 12px 0;
                color: rgb(231, 233, 234);
            }
            .saved-tweet-timeline .quoted-tweet a {
                color: rgb(29, 155, 240);
                text-decoration: none;
            }
            .saved-tweet-timeline .tweet-links {
                margin: 8px 0;
            }
            .saved-tweet-timeline .tweet-links a {
                color: rgb(29, 155, 240);
                text-decoration: none;
                margin-right: 8px;
            }
            .saved-tweet-timeline .tweet-metrics {
                display: flex;
                margin: 12px 0;
                color: rgb(113, 118, 123);
                font-size: 13px;
                gap: 24px;
            }
            .saved-tweet-timeline .actions {
                display: flex;
                margin-top: 12px;
                gap: 8px;
            }
            .saved-tweet-timeline .remember-btn {
                background: rgb(29, 155, 240);
                color: white;
                padding: 6px 16px;
                border-radius: 9999px;
                border: none;
                cursor: pointer;
                font-weight: 700;
                font-size: 14px;
            }
            .saved-tweet-timeline .remember-btn:hover {
                background: rgb(26, 140, 216);
            }
            .saved-tweet-timeline .review-badge {
                background: rgb(255, 149, 0);
                color: white;
                padding: 2px 8px;
                border-radius: 4px;
                font-size: 13px;
                font-weight: 600;
                margin-left: auto;
            }
            .saved-tweet-timeline .metrics-actions {
                display: flex;
                align-items: center;
                margin-top: 12px;
            }
            .saved-tweet-timeline .tweet-metrics {
                display: flex;
                color: rgb(113, 118, 123);
                font-size: 13px;
                gap: 24px;
                flex-grow: 1;
                margin: 0;
            }
            .saved-tweet-timeline .actions {
                display: flex;
                gap: 16px;
                align-items: center;
                margin: 0;
            }
            .saved-tweet-timeline .remove-btn {
                background: none;
                border: none;
                color: rgb(113, 118, 123);
                cursor: pointer;
                font-size: 14px;
                padding: 6px 16px;
            }
            .saved-tweet-timeline .remove-btn:hover {
                color: rgb(244, 33, 46);
            }
            .saved-tweet-timeline .next-review {
                color: rgb(113, 118, 123);
                font-size: 14px;
                padding: 6px 16px;
            }
        `;
        document.head.appendChild(styles);

        article.innerHTML = `
            <div class="tweet-container">
                <img class="profile-pic" src="${tweetData.profilePic}" alt="">
                <div class="content">
                    <div class="tweet-header">
                        <a href="${tweetData.accountLink}" class="handle" target="_blank">
                            ${tweetData.handle}
                        </a>
                        ${tweetData.timestamp ? `
                            <span class="tweet-metadata">
                                <span class="dot-separator">·</span>
                                ${new Date(tweetData.timestamp).toLocaleDateString()}
                            </span>
                        ` : ''}
                        <span class="review-badge">Needs Review 🏄</span>
                    </div>
                    <div class="tweet-text">${tweetData.text || 'No text content'}</div>
                    ${tweetData.mediaUrl ? `
                        <div class="tweet-media">
                            <img src="${tweetData.mediaUrl}" alt="Tweet media" />
                        </div>
                    ` : ''}
                    ${tweetData.quotedTweetUrl ? `
                        <div class="quoted-tweet">
                            <a href="${tweetData.quotedTweetUrl}" target="_blank">Quoted Tweet</a>
                        </div>
                    ` : ''}
                    ${tweetData.links && tweetData.links.length > 0 ? `
                        <div class="tweet-links">
                            ${tweetData.links.map(link => `<a href="${link}" target="_blank">${new URL(link).hostname}</a>`).join('')}
                        </div>
                    ` : ''}
                    <div class="metrics-actions">
                        ${tweetData.metrics ? `
                            <div class="tweet-metrics">
                                <span class="metric replies">${tweetData.metrics.replies} replies</span>
                                <span class="metric retweets">${tweetData.metrics.retweets} retweets</span>
                                <span class="metric likes">${tweetData.metrics.likes} likes</span>
                                <span class="metric views">${tweetData.metrics.views} views</span>
                            </div>
                        ` : ''}
                        <div class="actions">
                            <button class="remove-btn">Remove</button>
                            <button class="remember-btn">Remember</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Event handlers
        const rememberBtn = article.querySelector('.remember-btn');
        rememberBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            e.preventDefault();
            markTweet(tweetData.id, true);

            // Replace buttons with next review date
            const actionsDiv = article.querySelector('.actions');
            const nextReviewDate = new Date(Date.now() + ONE_DAY).toLocaleDateString();
            actionsDiv.innerHTML = `
                <span class="next-review">Next review: ${nextReviewDate}</span>
            `;
        });

        // Add remove button handler
        const removeBtn = article.querySelector('.remove-btn');
        removeBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            e.preventDefault();
            removeTweet(tweetData.id);
            article.remove();
        });

        // Make the tweet clickable to open the original
        article.addEventListener('click', function (e) {
            if (!e.target.closest('button') && !e.target.closest('a')) {
                window.open(tweetData.url, '_blank');
            }
        });

        return article;
    }

    // Remove a tweet from saved tweets.
    function removeTweet(tweetId) {
        chrome.storage.local.get({ savedTweets: {} }, function (result) {
            const savedTweets = result.savedTweets;
            delete savedTweets[tweetId];
            chrome.storage.local.set({ savedTweets: savedTweets }, function () {
                debugLog("Tweet removed:", tweetId);
            });
        });
    }

    // FSRS update: if remembered, double the interval (but cap at 1 year). Otherwise, reset to 1 day.
    function markTweet(tweetId, remembered) {
        chrome.storage.local.get({ savedTweets: {} }, function (result) {
            const savedTweets = result.savedTweets;
            const tweet = savedTweets[tweetId];
            if (!tweet) return;
            const now = Date.now();
            if (remembered) {
                tweet.reviewCount = (tweet.reviewCount || 0) + 1;
                const newInterval = tweet.interval * 2;
                tweet.interval = newInterval > ONE_YEAR ? ONE_YEAR : newInterval;
            } else {
                tweet.reviewCount = 0;
                tweet.interval = ONE_DAY;
            }
            tweet.lastReviewed = now;
            tweet.nextReview = now + tweet.interval;
            savedTweets[tweetId] = tweet;
            chrome.storage.local.set({ savedTweets: savedTweets }, function () {
                debugLog("Tweet updated:", tweet);
            });
        });
    }

    // Add these variables for tracking
    let usedPositions = new Set();
    let tweetQueue = [];
    let isProcessingQueue = false;
    let lastScrollPosition = window.scrollY;
    let scrollDirection = 'down';
    let intersectionObserver;

    // Replace updateReviewContainer with this new version
    function updateReviewContainer() {
        try {
            if (!chrome?.storage?.local) {
                console.error('Chrome storage API not available');
                return;
            }

            chrome.storage.local.get({ savedTweets: {} }, function (result) {
                try {
                    const savedTweets = result.savedTweets;
                    const now = Date.now();
                    const dueTweets = Object.values(savedTweets)
                        .filter(tweet => tweet && tweet.nextReview <= now);

                    console.log('Found due tweets:', dueTweets.length);

                    // Reset queue with new due tweets
                    tweetQueue = dueTweets;

                    // Start processing if not already running
                    if (!isProcessingQueue) {
                        processNextTweet();
                    }
                } catch (err) {
                    console.error('Error in updateReviewContainer:', err);
                }
            });
        } catch (err) {
            console.error('Error updating review container:', err);
        }
    }

    // Add new function to process tweet queue
    function processNextTweet() {
        if (tweetQueue.length === 0) {
            isProcessingQueue = false;
            return;
        }

        isProcessingQueue = true;
        const tweet = tweetQueue[0];

        // Skip if already shown
        if (document.querySelector(`[data-tweet-id="${tweet.id}"]`)) {
            tweetQueue.shift();
            processNextTweet();
            return;
        }

        const insertionPoint = findOptimalInsertionPoint();
        if (insertionPoint) {
            const tweetElem = createTweetElement(tweet);
            insertionPoint.parentNode.insertBefore(tweetElem, insertionPoint);
            console.log('Inserted review tweet:', tweet.id);

            // Track position
            usedPositions.add(insertionPoint.dataset.position);

            // Set up intersection observer for this tweet
            observeTweet(tweetElem);

            tweetQueue.shift();
        }

        // Schedule next processing
        setTimeout(processNextTweet, 500);
    }

    // Add function to find optimal insertion point
    function findOptimalInsertionPoint() {
        const timeline = document.querySelector('[data-testid="primaryColumn"]');
        if (!timeline) return null;

        const realTweets = Array.from(timeline.querySelectorAll(
            'article[data-testid="tweet"]:not([data-tweet-id])'
        ));

        // Get viewport info
        const viewportHeight = window.innerHeight;
        const scrollBottom = window.scrollY + viewportHeight;

        // Filter to tweets in and just below viewport
        const eligibleTweets = realTweets.filter(tweet => {
            const rect = tweet.getBoundingClientRect();
            const tweetTop = rect.top + window.scrollY;
            return tweetTop > window.scrollY &&
                tweetTop < scrollBottom + (viewportHeight * VIEWPORT_BUFFER);
        });

        // Find position that maintains minimum gap from other resurfaced tweets
        for (let i = 0; i < eligibleTweets.length; i++) {
            if (!usedPositions.has(i.toString()) &&
                !isNearUsedPosition(i)) {
                eligibleTweets[i].dataset.position = i.toString();
                return eligibleTweets[i];
            }
        }

        return null;
    }

    // Add helper function to check position spacing
    function isNearUsedPosition(position) {
        return Array.from(usedPositions).some(usedPos => {
            const gap = Math.abs(parseInt(usedPos) - position);
            return gap < MINIMUM_TWEET_GAP;
        });
    }

    // Add scroll tracking
    function setupScrollTracking() {
        window.addEventListener('scroll', () => {
            const currentScroll = window.scrollY;
            scrollDirection = currentScroll > lastScrollPosition ? 'down' : 'up';
            lastScrollPosition = currentScroll;

            // Clean up old positions when scrolling up
            if (scrollDirection === 'up') {
                cleanupOldPositions();
            }

            // Process queue when near bottom
            const bottomDistance = document.documentElement.scrollHeight -
                (window.scrollY + window.innerHeight);
            if (bottomDistance < SCROLL_THRESHOLD) {
                if (!isProcessingQueue && tweetQueue.length > 0) {
                    processNextTweet();
                }
            }
        }, { passive: true });
    }

    // Add cleanup function
    function cleanupOldPositions() {
        const viewportTop = window.scrollY;
        document.querySelectorAll('[data-tweet-id]').forEach(tweet => {
            const rect = tweet.getBoundingClientRect();
            const tweetTop = rect.top + window.scrollY;
            if (tweetTop < viewportTop - (window.innerHeight * VIEWPORT_BUFFER)) {
                usedPositions.delete(tweet.dataset.position);
                tweet.remove();
            }
        });
    }

    // Add intersection observer setup
    function setupIntersectionObserver() {
        intersectionObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (!entry.isIntersecting) {
                        const tweet = entry.target;
                        const rect = tweet.getBoundingClientRect();
                        const tweetTop = rect.top + window.scrollY;

                        // Remove if scrolled far past
                        if (tweetTop < window.scrollY - (window.innerHeight * VIEWPORT_BUFFER)) {
                            usedPositions.delete(tweet.dataset.position);
                            tweet.remove();
                        }
                    }
                });
            },
            { rootMargin: `${window.innerHeight * VIEWPORT_BUFFER}px 0px` }
        );
    }

    function observeTweet(tweetElement) {
        if (intersectionObserver) {
            intersectionObserver.observe(tweetElement);
        }
    }

    // Initialize new functionality
    setupScrollTracking();
    setupIntersectionObserver();

    // Modify interval to check more frequently but process more intelligently
    setInterval(updateReviewContainer, DEBUG_MODE ? 15000 : 60000);

    // Run tests when extension loads
    if (DEBUG_MODE) {
        debugLog('Debug mode enabled - 1 day = 2 minutes');
        runTests();
    }

    // Update the waitForTimeline function to be more persistent
    function waitForTimeline() {
        const timelineSelectors = [
            'div[aria-label="Timeline: Your Home Timeline"]',
            'div[aria-label="Timeline: Following"]',
            'div[aria-label*="Timeline"]',
            'div[aria-label*="Conversation"]',
            'div[data-testid="primaryColumn"]'
        ];

        let found = false;
        for (const selector of timelineSelectors) {
            if (document.querySelector(selector)) {
                found = true;
                break;
            }
        }

        if (found) {
            addSaveButtons();
            setTimeout(updateReviewContainer, 2000);
        } else {
            setTimeout(waitForTimeline, 1000);
        }
    }

    // Also add a URL change observer to handle navigation between different Twitter pages
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            debugLog('URL changed, reinitializing save buttons');
            waitForTimeline();
        }
    }).observe(document, { subtree: true, childList: true });

    // Start the initial process
    waitForTimeline();
})();
