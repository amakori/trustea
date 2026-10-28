package com.instapay.android.network

import android.util.Log
import com.google.gson.Gson
import com.instapay.android.data.DispatchUssdCommand
import com.instapay.android.data.ExecuteActionCommand
import com.instapay.android.data.InterceptedPromptPayload
import com.instapay.android.data.StepUpdatePayload
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject
import java.net.URI

object SocketManager {

    private const val TAG = "InstapaySocket"
    private var socket: Socket? = null
    private val gson = Gson()

    var onDispatchReceived: ((DispatchUssdCommand) -> Unit)? = null
    var onExecuteActionReceived: ((ExecuteActionCommand) -> Unit)? = null
    var onConnectionStateChanged: ((Boolean) -> Unit)? = null

    fun connect(serverUrl: String, deviceId: String) {
        if (socket != null && socket!!.connected()) {
            return
        }

        try {
            val uri = URI.create(serverUrl)
            val options = IO.Options.builder()
                .setReconnection(true)
                .setReconnectionAttempts(Int.MAX_VALUE)
                .setReconnectionDelay(2000)
                .build()

            socket = IO.socket(uri, options)

            socket?.on(Socket.EVENT_CONNECT) {
                Log.d(TAG, "Socket connected to Hub: $serverUrl")
                onConnectionStateChanged?.invoke(true)

                // Register Gateway device
                val regData = JSONObject().apply {
                    put("deviceId", deviceId)
                    put("battery", 95)
                    put("balance", 8450.00)
                }
                socket?.emit("gateway:register", regData)
            }

            socket?.on(Socket.EVENT_DISCONNECT) {
                Log.d(TAG, "Socket disconnected")
                onConnectionStateChanged?.invoke(false)
            }

            socket?.on(Socket.EVENT_CONNECT_ERROR) { args ->
                Log.e(TAG, "Socket connection error: ${args.getOrNull(0)}")
                onConnectionStateChanged?.invoke(false)
            }

            // Loan dispatch trigger from Hub/MFI
            socket?.on("gateway:dispatch_ussd") { args ->
                try {
                    val jsonStr = args[0].toString()
                    val command = gson.fromJson(jsonStr, DispatchUssdCommand::class.java)
                    Log.d(TAG, "Received dispatch command: ${command.command} for loan ${command.loanId}")
                    onDispatchReceived?.invoke(command)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing dispatch_ussd: ${e.message}", e)
                }
            }

            // Customer confirmation / cancellation response from Hub
            socket?.on("gateway:execute_command") { args ->
                try {
                    val jsonStr = args[0].toString()
                    val command = gson.fromJson(jsonStr, ExecuteActionCommand::class.java)
                    Log.d(TAG, "Received execute command: ${command.action} for loan ${command.loanId}")
                    onExecuteActionReceived?.invoke(command)
                } catch (e: Exception) {
                    Log.e(TAG, "Error parsing execute_command: ${e.message}", e)
                }
            }

            socket?.connect()

        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize socket: ${e.message}", e)
            onConnectionStateChanged?.invoke(false)
        }
    }

    fun isConnected(): Boolean = socket?.connected() == true

    fun emitStepUpdate(payload: StepUpdatePayload) {
        val json = JSONObject(gson.toJson(payload))
        socket?.emit("gateway:ussd_step_update", json)
    }

    fun emitPromptIntercepted(payload: InterceptedPromptPayload) {
        val json = JSONObject(gson.toJson(payload))
        socket?.emit("gateway:ussd_prompt_intercepted", json)
        Log.d(TAG, "Emitted ussd_prompt_intercepted for loan ${payload.loanId}")
    }

    fun emitSmsReceived(rawSms: String, gatewayId: String) {
        val json = JSONObject().apply {
            put("rawSms", rawSms)
            put("gatewayId", gatewayId)
        }
        socket?.emit("gateway:sms_received", json)
        Log.d(TAG, "Emitted sms_received to Hub")
    }

    fun disconnect() {
        socket?.disconnect()
        socket = null
    }
}
