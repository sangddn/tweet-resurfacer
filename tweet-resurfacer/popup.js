function displaySavedTweets() {
    chrome.storage.local.get({ savedTweets: {} }, function (result) {
        console.log('Retrieved saved tweets:', result.savedTweets)
        const savedTweetsDiv = document.getElementById('savedTweets')
        const tweets = Object.values(result.savedTweets || {})

        if (tweets.length === 0) {
            savedTweetsDiv.innerHTML = '<div class="no-tweets">No saved tweets yet</div>'
            return
        }

        savedTweetsDiv.innerHTML = tweets.map(tweet => `
            <div class="saved-tweet" data-tweet-id="${tweet.id}" data-tweet-url="${tweet.url}">
                <div class="tweet-header">
                    <img src="${tweet.profilePic}" class="profile-pic" alt="Profile picture">
                    <a href="${tweet.accountLink}" class="handle" target="_blank">${tweet.handle}</a>
                </div>
                <div class="tweet-content">
                    <div class="tweet-text">${tweet.text}</div>
                    ${tweet.mediaUrl ? `
                        <div class="tweet-media">
                            <img src="${tweet.mediaUrl}" alt="Tweet media" />
                        </div>
                    ` : ''}
                    ${tweet.quotedTweetUrl ? `
                        <div class="quoted-tweet">
                            <a href="${tweet.quotedTweetUrl}" target="_blank">Quoted Tweet</a>
                        </div>
                    ` : ''}
                    ${tweet.links && tweet.links.length > 0 ? `
                        <div class="tweet-links">
                            ${tweet.links.map(link => `<a href="${link}" target="_blank">${new URL(link).hostname}</a>`).join('')}
                        </div>
                    ` : ''}
                </div>
                <div class="tweet-metrics">
                    <div class="metrics-left">
                        ${tweet.metrics ? `
                            <span class="metric replies">${tweet.metrics.replies} replies</span>
                            <span class="metric retweets">${tweet.metrics.retweets} retweets</span>
                            <span class="metric likes">${tweet.metrics.likes} likes</span>
                            <span class="metric views">${tweet.metrics.views} views</span>
                        ` : ''}
                    </div>
                    <div class="metrics-right">
                        ${tweet.nextReview ? `
                            <span class="next-review">Next review: ${new Date(tweet.nextReview).toLocaleDateString()}</span>
                        ` : ''}
                    </div>
                </div>
                <div class="tweet-actions">
                    <div class="actions-left">
                        <button class="remove-btn" data-tweet-id="${tweet.id}">Remove</button>
                    </div>
                    <div class="actions-right">
                        <button class="review-today-btn" data-tweet-id="${tweet.id}">Review Today</button>
                        <button class="review-earlier-btn" data-tweet-id="${tweet.id}">Review Earlier</button>
                    </div>
                </div>
            </div>
        `).join('')

        document.querySelectorAll('.saved-tweet').forEach(tweetDiv => {
            tweetDiv.addEventListener('click', function (e) {
                const tweetUrl = this.getAttribute('data-tweet-url')
                window.open(tweetUrl, '_blank')
            })
        })

        document.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', function (e) {
                e.stopPropagation()
                const tweetId = this.getAttribute('data-tweet-id')
                removeTweet(tweetId)
            })
        })

        document.querySelectorAll('.review-today-btn').forEach(btn => {
            btn.addEventListener('click', function (e) {
                e.stopPropagation()
                const tweetId = this.getAttribute('data-tweet-id')
                updateReviewTime(tweetId, 'today')
            })
        })

        document.querySelectorAll('.review-earlier-btn').forEach(btn => {
            btn.addEventListener('click', function (e) {
                e.stopPropagation()
                const tweetId = this.getAttribute('data-tweet-id')
                updateReviewTime(tweetId, 'earlier')
            })
        })
    })
}

window.addEventListener('DOMContentLoaded', function () {
    console.log('Popup opened')
    const tabs = document.querySelectorAll('.tab')
    const tabContents = document.querySelectorAll('.tab-content')

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.getAttribute('data-tab')

            tabs.forEach(t => t.classList.remove('active'))
            tabContents.forEach(content => content.classList.remove('active'))

            tab.classList.add('active')
            document.getElementById(tabId).classList.add('active')
        })
    })

    displaySavedTweets()
})

function markTweetRemembered(tweetId) {
    chrome.storage.local.get({ savedTweets: {} }, function (result) {
        console.log('Current saved tweets:', result.savedTweets)
        const savedTweets = result.savedTweets
        const tweet = savedTweets[tweetId]

        if (tweet) {
            tweet.lastReviewed = Date.now()
            tweet.reviewCount = (tweet.reviewCount || 0) + 1
            tweet.interval = (tweet.interval || 86400000) * 2  // Default to 1 day if not set
            tweet.nextReview = Date.now() + tweet.interval

            chrome.storage.local.set({ savedTweets }, function () {
                if (chrome.runtime.lastError) {
                    console.error('Error saving tweets:', chrome.runtime.lastError)
                    return
                }
                displaySavedTweets()
            })
        }
    })
}

function updateReviewTime(tweetId, type) {
    chrome.storage.local.get({ savedTweets: {} }, function (result) {
        const savedTweets = result.savedTweets
        const tweet = savedTweets[tweetId]

        if (tweet) {
            const now = Date.now()
            if (type === 'today') {
                tweet.nextReview = now
            } else if (type === 'earlier') {
                const currentInterval = tweet.nextReview - now
                tweet.nextReview = now + (currentInterval / 2)
            }

            chrome.storage.local.set({ savedTweets }, function () {
                if (chrome.runtime.lastError) {
                    console.error('Error saving tweets:', chrome.runtime.lastError)
                    return
                }
                displaySavedTweets()
            })
        }
    })
}

function removeTweet(tweetId) {
    chrome.storage.local.get({ savedTweets: {} }, function (result) {
        const savedTweets = result.savedTweets
        delete savedTweets[tweetId]

        chrome.storage.local.set({ savedTweets }, function () {
            displaySavedTweets()
        })
    })
}

document.getElementById('clearStorage').addEventListener('click', function () {
    if (confirm('Are you sure you want to clear all saved tweets?')) {
        chrome.storage.local.set({ savedTweets: {} }, function () {
            if (chrome.runtime.lastError) {
                console.error('Error clearing tweets:', chrome.runtime.lastError)
                return
            }
            displaySavedTweets()
        })
    }
})
