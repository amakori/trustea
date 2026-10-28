package com.instapay.android.data

import com.google.gson.annotations.SerializedName

data class DispatchUssdCommand(
    @SerializedName("command") val command: String, // "DISPATCH_SEND_MONEY" or "DISPATCH_GET_CASH"
    @SerializedName("loanId") val loanId: String,
    @SerializedName("amount") val amount: Double,
    @SerializedName("recipientPhone") val recipientPhone: String?,
    @SerializedName("agentNumber") val agentNumber: String?,
    @SerializedName("ussdCode") val ussdCode: String = "*115#"
)

data class ExecuteActionCommand(
    @SerializedName("action") val action: String, // "ENTER_PIN" or "CLICK_CANCEL"
    @SerializedName("loanId") val loanId: String,
    @SerializedName("flowType") val flowType: String
)

data class InterceptedPromptPayload(
    @SerializedName("loanId") val loanId: String,
    @SerializedName("rawText") val rawText: String,
    @SerializedName("stepName") val stepName: String = "CONFIRMATION_SCREEN"
)

data class StepUpdatePayload(
    @SerializedName("loanId") val loanId: String,
    @SerializedName("step") val step: Int,
    @SerializedName("stepName") val stepName: String,
    @SerializedName("action") val action: String
)

data class IncomingSmsPayload(
    @SerializedName("raw_sms") val rawSms: String,
    @SerializedName("gateway_id") val gatewayId: String
)

data class HeartbeatPayload(
    @SerializedName("battery_level") val batteryLevel: Int,
    @SerializedName("balance") val balance: Double,
    @SerializedName("status") val status: String
)

data class LogItem(
    val timestamp: String,
    val tag: String,
    val message: String,
    val isError: Boolean = false
)
