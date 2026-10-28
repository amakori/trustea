package com.instapay.android.accessibility

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.instapay.android.InstapayApp
import com.instapay.android.data.DispatchUssdCommand
import com.instapay.android.data.ExecuteActionCommand
import com.instapay.android.data.InterceptedPromptPayload
import com.instapay.android.data.StepUpdatePayload
import com.instapay.android.network.SocketManager
import java.util.regex.Pattern

class InstapayAccessibilityService : AccessibilityService() {

    companion object {
        const val TAG = "InstapayUSSD"
        var instance: InstapayAccessibilityService? = null
            private set
        var isServiceConnected = false
            private set
    }

    enum class FlowType {
        NONE,
        SEND_MONEY,
        GET_CASH
    }

    enum class UssdState {
        IDLE,
        DIALED_CODE,
        // Send Money States
        SM_STEP_1_MENU,
        SM_STEP_2_AIRTEL_MONEY,
        SM_STEP_3_DESTINATION,
        SM_STEP_4_ENTER_PHONE,
        SM_STEP_5_ENTER_AMOUNT,
        SM_STEP_6_AWAIT_CONFIRMATION,
        SM_STEP_7_ENTER_PIN,
        // Get Cash States
        GC_STEP_1_MENU,
        GC_STEP_2_CASHOUT,
        GC_STEP_3_ENTER_AMOUNT,
        GC_STEP_4_AWAIT_CONFIRMATION,
        GC_STEP_5_ENTER_PIN,
        // Final
        AWAITING_FINAL_DISMISS,
        COMPLETED
    }

    private var activeFlow = FlowType.NONE
    private var currentState = UssdState.IDLE
    private var currentLoanId = ""
    private var targetPhone = ""
    private var targetAmount = 0.0
    private var targetAgent = ""
    private var lastInterceptedNode: AccessibilityNodeInfo? = null

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        isServiceConnected = true
        Log.d(TAG, "Instapay Accessibility Service Connected!")
        InstapayApp.instance.addLog("ACCESSIBILITY", "USSD Service Connected & Ready")

        // Register action listeners from Socket
        SocketManager.onDispatchReceived = { command ->
            startUssdFlow(command)
        }

        SocketManager.onExecuteActionReceived = { command ->
            handleExecuteAction(command)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        instance = null
        isServiceConnected = false
        Log.d(TAG, "Instapay Accessibility Service Destroyed")
        InstapayApp.instance.addLog("ACCESSIBILITY", "USSD Service Stopped", true)
    }

    /**
     * Start the USSD execution triggered remotely by MFI / Customer App
     */
    fun startUssdFlow(command: DispatchUssdCommand) {
        currentLoanId = command.loanId
        targetAmount = command.amount
        targetPhone = command.recipientPhone ?: ""
        targetAgent = command.agentNumber ?: ""

        if (command.command == "DISPATCH_GET_CASH") {
            activeFlow = FlowType.GET_CASH
            currentState = UssdState.DIALED_CODE
            InstapayApp.instance.addLog("FLOW", "Starting Get Cash USSD flow: ZMW $targetAmount at Agent $targetAgent")
        } else {
            activeFlow = FlowType.SEND_MONEY
            currentState = UssdState.DIALED_CODE
            InstapayApp.instance.addLog("FLOW", "Starting Send Money USSD flow: ZMW $targetAmount to $targetPhone")
        }

        reportStep(1, "DIALING", "Dialing ${command.ussdCode}")
        dialUssd(command.ussdCode)
    }

    private fun dialUssd(ussdCode: String) {
        val encodedHash = Uri.encode("#")
        val cleanCode = ussdCode.replace("#", encodedHash)
        val callIntent = Intent(Intent.ACTION_CALL, Uri.parse("tel:$cleanCode")).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        try {
            startActivity(callIntent)
            InstapayApp.instance.addLog("USSD", "Telephony dialer invoked: $ussdCode")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to place call: ${e.message}", e)
            InstapayApp.instance.addLog("USSD", "Call failed: ${e.message}", true)
        }
    }

    /**
     * Process USSD Dialog Events
     */
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null || activeFlow == FlowType.NONE || currentState == UssdState.IDLE) {
            return
        }

        val eventTextList = event.text
        if (eventTextList.isEmpty()) return

        val dialogText = eventTextList.joinToString(" ")
        Log.d(TAG, "Dialog Event Text: $dialogText | Current State: $currentState")

        val rootNode = rootInActiveWindow ?: event.source ?: return
        lastInterceptedNode = rootNode

        when (activeFlow) {
            FlowType.SEND_MONEY -> handleSendMoneyFlow(rootNode, dialogText)
            FlowType.GET_CASH -> handleGetCashFlow(rootNode, dialogText)
            else -> {}
        }
    }

    /**
     * Exact Send Money Airtel *115# Step Progression:
     * 1) Call *115#
     * 2) Enter 1 into input and select "SEND"
     * 3) Enter 1 into input and select "SEND"
     * 4) Enter 1 into input and select "SEND"
     * 5) Enter PHONE NUMBER and select "SEND"
     * 6) Enter AMOUNT and select "SEND"
     * 7) Confirmation prompt:
     *    'SEND Money to [FIRSTNAME] [LASTNAME] on [PHONE]. Amount ZMW [AMOUNT].'
     *    Send details to Instapay Customer App for confirmation.
     *    Wait for confirmation. If user cancels -> click CANCEL.
     *    If confirmed -> enter 4-digit PIN.
     * 8) Dismiss final dialog -> await SMS.
     */
    private fun handleSendMoneyFlow(rootNode: AccessibilityNodeInfo, dialogText: String) {
        val lowerText = dialogText.toLowerCase()

        // Step 6: Confirmation Screen check (Highest Priority)
        // Matches: "SEND Money to [FIRSTNAME] [LASTNAME] on [PHONE]. Amount ZMW [AMOUNT]."
        if (lowerText.contains("send money to") && (lowerText.contains("amount zmw") || lowerText.contains("zmw"))) {
            if (currentState != UssdState.SM_STEP_6_AWAIT_CONFIRMATION && currentState != UssdState.SM_STEP_7_ENTER_PIN) {
                currentState = UssdState.SM_STEP_6_AWAIT_CONFIRMATION
                reportStep(6, "CONFIRMATION_INTERCEPTED", "Captured recipient confirmation prompt")
                InstapayApp.instance.addLog("INTERCEPT", "USSD Prompt captured: $dialogText")

                // Emit intercepted prompt to Customer App & MFI Hub
                SocketManager.emitPromptIntercepted(
                    InterceptedPromptPayload(
                        loanId = currentLoanId,
                        rawText = dialogText,
                        stepName = "SEND_MONEY_CONFIRMATION"
                    )
                )
                // Stop and wait for customer response!
                return
            }
        }

        // Step 1: Initial Menu -> Enter "1" (Send Money)
        if (currentState == UssdState.DIALED_CODE && (lowerText.contains("send money") || lowerText.contains("airtel money") || lowerText.contains("1)"))) {
            currentState = UssdState.SM_STEP_1_MENU
            reportStep(2, "SELECT_SEND_MONEY", "Entered 1")
            inputTextAndClickSend(rootNode, "1")
            return
        }

        // Step 2: Next Submenu -> Enter "1"
        if (currentState == UssdState.SM_STEP_1_MENU) {
            currentState = UssdState.SM_STEP_2_AIRTEL_MONEY
            reportStep(3, "SELECT_SUB_1", "Entered 1")
            inputTextAndClickSend(rootNode, "1")
            return
        }

        // Step 3: Destination Submenu -> Enter "1"
        if (currentState == UssdState.SM_STEP_2_AIRTEL_MONEY) {
            currentState = UssdState.SM_STEP_3_DESTINATION
            reportStep(4, "SELECT_SUB_2", "Entered 1")
            inputTextAndClickSend(rootNode, "1")
            return
        }

        // Step 4: Enter Recipient Phone Number
        if (currentState == UssdState.SM_STEP_3_DESTINATION && (lowerText.contains("phone") || lowerText.contains("number") || lowerText.contains("mobile") || lowerText.contains("recipient"))) {
            currentState = UssdState.SM_STEP_4_ENTER_PHONE
            reportStep(5, "ENTER_PHONE", "Entering recipient phone: $targetPhone")
            inputTextAndClickSend(rootNode, targetPhone)
            return
        }

        // Step 5: Enter Amount
        if (currentState == UssdState.SM_STEP_4_ENTER_PHONE && (lowerText.contains("amount") || lowerText.contains("enter amount"))) {
            currentState = UssdState.SM_STEP_5_ENTER_AMOUNT
            val amountStr = String.format("%.0f", targetAmount)
            reportStep(6, "ENTER_AMOUNT", "Entering amount: ZMW $amountStr")
            inputTextAndClickSend(rootNode, amountStr)
            return
        }

        // Final Dismiss Screen
        if (currentState == UssdState.SM_STEP_7_ENTER_PIN && (lowerText.contains("request is being processed") || lowerText.contains("thank you") || lowerText.contains("successful"))) {
            currentState = UssdState.COMPLETED
            reportStep(8, "COMPLETED", "USSD transaction completed. Awaiting carrier SMS.")
            clickCancelOrDismiss(rootNode)
            activeFlow = FlowType.NONE
            return
        }
    }

    /**
     * Exact Get Cash Airtel *115# Step Progression:
     * 1) Call *115#
     * 2) Enter 2 into input and select "SEND"
     * 3) Select 1 and select "SEND"
     * 4) Enter amount and select "SEND"
     * 5) Prompt:
     *    'WITHDRAW ZMW [AMOUNT] from [ENTERED_NUMBER] [FIRSTNAME] [LASTNAME] transaction fee ZMW [TRANSACTION_AMOUNT]'
     *    Send to customer app to confirm details.
     *    Wait for confirmation. If user cancels -> click CANCEL.
     *    If user confirms -> enter stored money withdraw PIN.
     * 6) Update MFI and await SMS.
     */
    private fun handleGetCashFlow(rootNode: AccessibilityNodeInfo, dialogText: String) {
        val lowerText = dialogText.toLowerCase()

        // Step 4: Confirmation screen check (Highest Priority)
        // Matches: "WITHDRAW ZMW [AMOUNT] from [ENTERED_NUMBER] [FIRSTNAME] [LASTNAME] transaction fee ZMW [FEE]"
        if (lowerText.contains("withdraw zmw") || (lowerText.contains("withdraw") && lowerText.contains("transaction fee"))) {
            if (currentState != UssdState.GC_STEP_4_AWAIT_CONFIRMATION && currentState != UssdState.GC_STEP_5_ENTER_PIN) {
                currentState = UssdState.GC_STEP_4_AWAIT_CONFIRMATION
                reportStep(4, "CONFIRMATION_INTERCEPTED", "Captured Get Cash confirmation prompt")
                InstapayApp.instance.addLog("INTERCEPT", "Get Cash Prompt captured: $dialogText")

                SocketManager.emitPromptIntercepted(
                    InterceptedPromptPayload(
                        loanId = currentLoanId,
                        rawText = dialogText,
                        stepName = "GET_CASH_CONFIRMATION"
                    )
                )
                // Stop and wait for customer response!
                return
            }
        }

        // Step 1: Menu -> Enter "2" (Get Cash / Cash Out)
        if (currentState == UssdState.DIALED_CODE && (lowerText.contains("cash") || lowerText.contains("2)"))) {
            currentState = UssdState.GC_STEP_1_MENU
            reportStep(2, "SELECT_GET_CASH", "Entered 2")
            inputTextAndClickSend(rootNode, "2")
            return
        }

        // Step 2: Select 1 -> Send
        if (currentState == UssdState.GC_STEP_1_MENU) {
            currentState = UssdState.GC_STEP_2_CASHOUT
            reportStep(3, "SELECT_CASHOUT_SUB_1", "Entered 1")
            inputTextAndClickSend(rootNode, "1")
            return
        }

        // Step 3: Enter Amount
        if (currentState == UssdState.GC_STEP_2_CASHOUT && (lowerText.contains("amount") || lowerText.contains("enter amount"))) {
            currentState = UssdState.GC_STEP_3_ENTER_AMOUNT
            val amountStr = String.format("%.0f", targetAmount)
            reportStep(4, "ENTER_AMOUNT", "Entering amount: ZMW $amountStr")
            inputTextAndClickSend(rootNode, amountStr)
            return
        }

        // Final Dismiss Screen
        if (currentState == UssdState.GC_STEP_5_ENTER_PIN && (lowerText.contains("processed") || lowerText.contains("thank you") || lowerText.contains("agent"))) {
            currentState = UssdState.COMPLETED
            reportStep(6, "COMPLETED", "Withdrawal authorized. Awaiting carrier SMS.")
            clickCancelOrDismiss(rootNode)
            activeFlow = FlowType.NONE
            return
        }
    }

    /**
     * Executes the customer's response decision
     */
    fun handleExecuteAction(command: ExecuteActionCommand) {
        val rootNode = lastInterceptedNode ?: rootInActiveWindow

        if (command.action == "ENTER_PIN") {
            InstapayApp.instance.addLog("PIN", "Customer CONFIRMED! Injecting 4-digit PIN...")
            val pin = InstapayApp.instance.prefs.airtelMoneyPin
            if (rootNode != null) {
                if (activeFlow == FlowType.SEND_MONEY) {
                    currentState = UssdState.SM_STEP_7_ENTER_PIN
                } else {
                    currentState = UssdState.GC_STEP_5_ENTER_PIN
                }
                reportStep(7, "ENTER_PIN", "Entering 4-digit authorization PIN")
                inputTextAndClickSend(rootNode, pin)
            } else {
                Log.e(TAG, "No active window node to inject PIN")
            }
        } else if (command.action == "CLICK_CANCEL") {
            InstapayApp.instance.addLog("CANCEL", "Customer CANCELLED. Clicking Cancel on USSD dialog...")
            if (rootNode != null) {
                clickCancel(rootNode)
            }
            activeFlow = FlowType.NONE
            currentState = UssdState.IDLE
            reportStep(99, "CANCELLED", "User clicked CANCEL")
        }
    }

    /**
     * Injects text into EditText and clicks the Send button
     */
    private fun inputTextAndClickSend(rootNode: AccessibilityNodeInfo, text: String) {
        val inputNode = findEditTextNode(rootNode)
        if (inputNode != null) {
            val arguments = Bundle().apply {
                putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
            }
            inputNode.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)
            Log.d(TAG, "Injected text: $text")
        } else {
            Log.w(TAG, "Could not find input EditText node")
        }

        // Click "Send" or "SEND" button
        val sendClicked = clickNodeByText(rootNode, listOf("Send", "SEND", "Submit", "SUBMIT", "Ok", "OK"))
        if (!sendClicked) {
            Log.w(TAG, "Could not find Send button to click")
        }
    }

    private fun clickCancel(rootNode: AccessibilityNodeInfo) {
        clickNodeByText(rootNode, listOf("Cancel", "CANCEL", "Dismiss", "DISMISS", "Exit", "EXIT"))
    }

    private fun clickCancelOrDismiss(rootNode: AccessibilityNodeInfo) {
        clickNodeByText(rootNode, listOf("Cancel", "CANCEL", "OK", "Ok", "Dismiss"))
    }

    private fun findEditTextNode(rootNode: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        // Try focused input first
        val focused = rootNode.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
        if (focused != null && (focused.className == "android.widget.EditText" || focused.isEditable)) {
            return focused
        }

        // Recursive search for EditText
        return findFirstMatchingNode(rootNode) { node ->
            node.className == "android.widget.EditText" || node.isEditable
        }
    }

    private fun clickNodeByText(rootNode: AccessibilityNodeInfo, targetTexts: List<String>): Boolean {
        for (target in targetTexts) {
            val nodes = rootNode.findAccessibilityNodeInfosByText(target)
            for (node in nodes) {
                if (node.isClickable) {
                    node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                    return true
                }
                var parent = node.parent
                while (parent != null) {
                    if (parent.isClickable) {
                        parent.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                        return true
                    }
                    parent = parent.parent
                }
            }
        }
        return false
    }

    private fun findFirstMatchingNode(
        rootNode: AccessibilityNodeInfo,
        predicate: (AccessibilityNodeInfo) -> Boolean
    ): AccessibilityNodeInfo? {
        if (predicate(rootNode)) return rootNode
        for (i in 0 until rootNode.childCount) {
            val child = rootNode.getChild(i) ?: continue
            val found = findFirstMatchingNode(child, predicate)
            if (found != null) return found
        }
        return null
    }

    private fun reportStep(stepNum: Int, stepName: String, actionDesc: String) {
        SocketManager.emitStepUpdate(
            StepUpdatePayload(
                loanId = currentLoanId,
                step = stepNum,
                stepName = stepName,
                action = actionDesc
            )
        )
    }

    override fun onInterrupt() {
        Log.w(TAG, "Accessibility Service onInterrupt")
    }
}
