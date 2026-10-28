package com.instapay.android.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.telephony.SmsMessage
import android.util.Log
import com.instapay.android.InstapayApp
import com.instapay.android.data.IncomingSmsPayload
import com.instapay.android.network.RetrofitClient
import com.instapay.android.network.SocketManager
import okhttp3.ResponseBody
import retrofit2.Call
import retrofit2.Callback
import retrofit2.Response

class InstapaySmsReceiver : BroadcastReceiver() {

    companion object {
        const val TAG = "InstapaySMS"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return

        val messages: Array<SmsMessage>? = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        if (messages.isNullOrEmpty()) return

        val sender = messages[0].displayOriginatingAddress ?: "Unknown"
        val bodyBuilder = StringBuilder()
        for (msg in messages) {
            bodyBuilder.append(msg.displayMessageBody)
        }
        val fullBody = bodyBuilder.toString()

        Log.d(TAG, "Incoming SMS from: $sender | Body: $fullBody")
        InstapayApp.instance.addLog("SMS", "Received from $sender: $fullBody")

        val gatewayId = InstapayApp.instance.prefs.gatewayId
        val hubUrl = InstapayApp.instance.prefs.hubUrl

        // 1. Send via Realtime WebSocket
        SocketManager.emitSmsReceived(fullBody, gatewayId)

        // 2. Guaranteed Delivery via HTTP POST to Hub
        try {
            val apiService = RetrofitClient.getApiService(hubUrl)
            val call = apiService.sendIncomingSms(IncomingSmsPayload(fullBody, gatewayId))
            call.enqueue(object : Callback<ResponseBody> {
                override fun onResponse(call: Call<ResponseBody>, response: Response<ResponseBody>) {
                    if (response.isSuccessful) {
                        Log.d(TAG, "Successfully posted SMS to Hub HTTP endpoint")
                        InstapayApp.instance.addLog("SMS_SYNC", "Synchronized SMS with MFI backend")
                    } else {
                        Log.w(TAG, "Failed posting SMS to Hub HTTP: ${response.code()}")
                    }
                }

                override fun onFailure(call: Call<ResponseBody>, t: Throwable) {
                    Log.e(TAG, "Error posting SMS via HTTP: ${t.message}")
                }
            })
        } catch (e: Exception) {
            Log.e(TAG, "Exception posting SMS: ${e.message}")
        }
    }
}
