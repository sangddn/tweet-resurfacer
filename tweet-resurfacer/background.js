let popupWindow = null

chrome.action.onClicked.addListener(() => {
    if (popupWindow) {
        chrome.windows.update(popupWindow.id, { focused: true })
        return
    }

    chrome.windows.create({
        url: 'popup.html',
        type: 'popup',
        width: 600,
        height: 800,
        left: 100,
        top: 100
    }, (window) => {
        popupWindow = window
    })
})

chrome.windows.onRemoved.addListener((windowId) => {
    if (popupWindow && popupWindow.id === windowId) {
        popupWindow = null
    }
}) 