package com.instapay.android.simulator

import android.app.AlertDialog
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import com.instapay.android.InstapayApp
import com.instapay.android.accessibility.InstapayAccessibilityService
import com.instapay.android.data.DispatchUssdCommand
import com.instapay.android.network.SocketManager

object UssdSimulationDialog {

    private val handler = Handler(Looper.getMainLooper())

    fun showSimulationPicker(context: Context) {
        val options = arrayOf(
            "Simulate 'Send Money' (ZMW 150 to 0977123456)",
            "Simulate 'Get Cash' (ZMW 500 from Agent 492109)",
            "Simulate Incoming Airtel Money SMS"
        )

        AlertDialog.Builder(context)
            .setTitle("Instapay USSD Simulator")
            .setItems(options) { _, which ->
                when (which) {
                    0 -> runSendMoneySimulation(context)
                    1 -> runGetCashSimulation(context)
                    2 -> simulateIncomingSms(context)
                }
            }
            .setNegativeButton("Close", null)
            .show()
    }

    private fun runSendMoneySimulation(context: Context) {
        val loanId = "sim-sm-${System.currentTimeMillis()}"
        InstapayApp.instance.addLog("SIMULATOR", "Running Send Money simulation for $loanId")

        // 1. Dial *115#
        showStepDialog(
            context,
            title = "Airtel Money",
            message = "1) Send Money\n2) Withdraw Cash\n3) Buy Airtime\n4) Pay Bills\n9) My Account",
            stepAction = { input ->
                InstapayApp.instance.addLog("SIMULATOR", "Input: $input")
                // Step 2: Next Menu
                showStepDialog(
                    context,
                    title = "Send Money",
                    message = "1) Airtel Money\n2) Other Networks\n3) International",
                    stepAction = { _ ->
                        // Step 3: Enter Phone
                        showStepDialog(
                            context,
                            title = "Airtel Money",
                            message = "Enter recipient's mobile number:",
                            stepAction = { phone ->
                                // Step 4: Enter Amount
                                showStepDialog(
                                    context,
                                    title = "Airtel Money",
                                    message = "Enter amount in ZMW:",
                                    stepAction = { amount ->
                                        // Step 5: Intercepted Confirmation Prompt!
                                        val promptText = "SEND Money to CHANDA MULENGA on $phone. Amount ZMW $amount.00."
                                        InstapayApp.instance.addLog("SIMULATOR", "Intercepted: $promptText")

                                        // Emit to socket
                                        SocketManager.emitPromptIntercepted(
                                            com.instapay.android.data.InterceptedPromptPayload(
                                                loanId = loanId,
                                                rawText = promptText
                                            )
                                        )

                                        showConfirmationPrompt(context, promptText, loanId)
                                    }
                                )
                            }
                        )
                    }
                )
            }
        )
    }

    private fun runGetCashSimulation(context: Context) {
        val loanId = "sim-gc-${System.currentTimeMillis()}"
        InstapayApp.instance.addLog("SIMULATOR", "Running Get Cash simulation for $loanId")

        showStepDialog(
            context,
            title = "Airtel Money",
            message = "1) Send Money\n2) Withdraw Cash\n3) Buy Airtime\n4) Pay Bills",
            stepAction = { _ ->
                showStepDialog(
                    context,
                    title = "Withdraw Cash",
                    message = "1) From Agent\n2) From ATM",
                    stepAction = { _ ->
                        showStepDialog(
                            context,
                            title = "Withdraw Cash",
                            message = "Enter agent number:",
                            stepAction = { agent ->
                                showStepDialog(
                                    context,
                                    title = "Withdraw Cash",
                                    message = "Enter amount in ZMW:",
                                    stepAction = { amount ->
                                        val promptText = "WITHDRAW ZMW $amount.00 from $agent BWALYA KABWE transaction fee ZMW 12.50"
                                        InstapayApp.instance.addLog("SIMULATOR", "Intercepted: $promptText")

                                        SocketManager.emitPromptIntercepted(
                                            com.instapay.android.data.InterceptedPromptPayload(
                                                loanId = loanId,
                                                rawText = promptText
                                            )
                                        )

                                        showConfirmationPrompt(context, promptText, loanId)
                                    }
                                )
                            }
                        )
                    }
                )
            }
        )
    }

    private fun showConfirmationPrompt(context: Context, promptText: String, loanId: String) {
        val dialogView = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(40, 30, 40, 20)
        }
        val tvMessage = TextView(context).apply {
            text = "$promptText\n\n[Waiting for Customer confirmation from Instapay Customer App...]"
            textSize = 15f
        }
        dialogView.addView(tvMessage)

        val dialog = AlertDialog.Builder(context)
            .setTitle("USSD Prompt Intercepted")
            .setView(dialogView)
            .setCancelable(false)
            .setNegativeButton("Cancel Flow") { _, _ ->
                InstapayApp.instance.addLog("SIMULATOR", "Simulation flow cancelled")
            }
            .create()

        dialog.show()

        // Listen for execute command from socket
        SocketManager.onExecuteActionReceived = { cmd ->
            handler.post {
                if (dialog.isShowing) {
                    if (cmd.action == "ENTER_PIN") {
                        val pin = InstapayApp.instance.prefs.airtelMoneyPin
                        tvMessage.text = "$promptText\n\nCUSTOMER CONFIRMED!\nAuto-entering PIN: $pin"
                        handler.postDelayed({
                            dialog.dismiss()
                            showFinalSuccessDialog(context, loanId)
                        }, 1500)
                    } else {
                        tvMessage.text = "$promptText\n\nCUSTOMER CANCELLED!\nDismissing USSD dialog."
                        handler.postDelayed({ dialog.dismiss() }, 1500)
                    }
                }
            }
        }
    }

    private fun showFinalSuccessDialog(context: Context, loanId: String) {
        AlertDialog.Builder(context)
            .setTitle("USSD Success")
            .setMessage("Your request is being processed. You will receive an SMS confirmation shortly.")
            .setPositiveButton("OK") { _, _ ->
                // Auto trigger simulated SMS after 2 seconds
                handler.postDelayed({
                    simulateIncomingSms(context)
                }, 2000)
            }
            .show()
    }

    private fun simulateIncomingSms(context: Context) {
        val txnId = "TXN" + (10000000..99999999).random()
        val rawSms = "Trans. ID: $txnId. You have sent ZMW 150.00 to CHANDA MULENGA 0977123456 on 28/10/2026. Fee: ZMW 3.50. New balance: ZMW 8300.00."

        val gatewayId = InstapayApp.instance.prefs.gatewayId
        SocketManager.emitSmsReceived(rawSms, gatewayId)
        InstapayApp.instance.addLog("SIMULATOR", "Simulated incoming SMS: $rawSms")

        AlertDialog.Builder(context)
            .setTitle("Airtel Money SMS Received")
            .setMessage(rawSms)
            .setPositiveButton("OK", null)
            .show()
    }

    private fun showStepDialog(
        context: Context,
        title: String,
        message: String,
        stepAction: (String) -> Unit
    ) {
        val input = EditText(context).apply {
            setSingleLine(true)
        }
        AlertDialog.Builder(context)
            .setTitle(title)
            .setMessage(message)
            .setView(input)
            .setPositiveButton("Send") { _, _ ->
                stepAction(input.text.toString().trim())
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
}
