package com.instapay.android.data

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class AppPreferences(context: Context) {

    private val sharedPreferences: SharedPreferences

    init {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        sharedPreferences = try {
            EncryptedSharedPreferences.create(
                context,
                "instapay_secure_prefs",
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Exception) {
            // Fallback to standard prefs if hardware keystore issues occur on test emulators
            context.getSharedPreferences("instapay_prefs_fallback", Context.MODE_PRIVATE)
        }
    }

    var gatewayId: String
        get() = sharedPreferences.getString("gateway_id", "gateway-airtel-01") ?: "gateway-airtel-01"
        set(value) = sharedPreferences.edit().putString("gateway_id", value).apply()

    var hubUrl: String
        get() = sharedPreferences.getString("hub_url", "http://10.0.2.2:3001") ?: "http://10.0.2.2:3001"
        set(value) = sharedPreferences.edit().putString("hub_url", value).apply()

    var airtelMoneyPin: String
        get() = sharedPreferences.getString("airtel_pin", "2398") ?: "2398" // 4-digit PIN default
        set(value) = sharedPreferences.edit().putString("airtel_pin", value).apply()

    var withdrawPin: String
        get() = sharedPreferences.getString("withdraw_pin", "2398") ?: "2398"
        set(value) = sharedPreferences.edit().putString("withdraw_pin", value).apply()

    var lastReportedBalance: Float
        get() = sharedPreferences.getFloat("last_balance", 8450.00f)
        set(value) = sharedPreferences.edit().putFloat("last_balance", value).apply()

    var isSimulationMode: Boolean
        get() = sharedPreferences.getBoolean("simulation_mode", false)
        set(value) = sharedPreferences.edit().putBoolean("simulation_mode", value).apply()
}
